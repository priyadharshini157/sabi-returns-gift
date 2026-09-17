import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { User, Lock, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { collection, getDocs, doc, updateDoc, addDoc, query, where } from "firebase/firestore";
import { db } from "@/firebase";

interface LoginProps {
  onLoginSuccess?: (userData?: { role: 'Admin' | 'Employee'; name: string; employeeId?: string }) => void;
}

const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  // Flip state for 3D book page turning effect
  const [isFlipped, setIsFlipped] = useState(false);

  // Login form states
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Register form states
  const [regName, setRegName] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [registerError, setRegisterError] = useState("");
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Handle Login submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setLoginError("");

    const inputUser = username.trim().toLowerCase();
    const inputPass = password.trim();

    try {
      // 1. Admin Login (subash g / 561997)
      if (inputUser === "subash g" && inputPass === "561997") {
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("loggedInName", "Subash");
        localStorage.setItem("role", "Admin");
        localStorage.setItem("loginTimestamp", Date.now().toString());
        toast({
          title: "Welcome Back, Subash!",
          description: "Logged in as Admin",
        });

        if (onLoginSuccess) {
          onLoginSuccess({ role: 'Admin', name: 'Subash' });
        } else {
          navigate("/dashboard");
        }
        return;
      }

      // 2. Firebase Employee Check (Targeted query for maximum concurrency & low latency)
      try {
        let matchedDoc: any = null;
        
        // Fast targeted lookup for lowercase username
        const qLower = query(collection(db, "employees"), where("username", "==", inputUser));
        const snapLower = await getDocs(qLower);
        if (!snapLower.empty) {
          const docSnap = snapLower.docs.find(d => d.data().password === inputPass);
          if (docSnap) matchedDoc = { fireId: docSnap.id, ...docSnap.data() };
        }

        // Secondary lookup for exact typed casing if not matched
        if (!matchedDoc && inputUser !== username.trim()) {
          const qExact = query(collection(db, "employees"), where("username", "==", username.trim()));
          const snapExact = await getDocs(qExact);
          if (!snapExact.empty) {
            const docSnap = snapExact.docs.find(d => d.data().password === inputPass);
            if (docSnap) matchedDoc = { fireId: docSnap.id, ...docSnap.data() };
          }
        }

        // Fallback scan only if indexed queries didn't match (for legacy untrimmed records)
        if (!matchedDoc) {
          const q = query(collection(db, "employees"));
          const snap = await getDocs(q);
          matchedDoc = snap.docs
            .map((docSnap) => ({ fireId: docSnap.id, ...docSnap.data() } as any))
            .find(
              (emp) =>
                emp.username &&
                emp.username.toLowerCase() === inputUser &&
                emp.password === inputPass
            );
        }

        if (matchedDoc) {
          if (matchedDoc.status === "Approved") {
            updateDoc(doc(db, "employees", matchedDoc.fireId), {
              isLive: true,
              lastLoginAt: new Date().toISOString(),
            }).catch((err) => console.error("Error setting live status:", err));

            localStorage.setItem("isLoggedIn", "true");
            localStorage.setItem("loggedInName", matchedDoc.name || matchedDoc.username);
            localStorage.setItem("role", "Employee");
            localStorage.setItem("employeeId", matchedDoc.fireId);
            localStorage.setItem("loginTimestamp", Date.now().toString());

            toast({
              title: `Welcome, ${matchedDoc.name}!`,
              description: "Logged in successfully",
            });

            if (onLoginSuccess) {
              onLoginSuccess({
                role: 'Employee',
                name: matchedDoc.name || matchedDoc.username,
                employeeId: matchedDoc.fireId
              });
            } else {
              navigate("/dashboard");
            }
            return;
          } else {
            setLoginError("Your account is still pending approval or declined.");
            setIsLoading(false);
            return;
          }
        }
      } catch (fbErr) {
        console.warn("Firebase employee check failed:", fbErr);
      }

      // 3. Supabase Auth fallback
      try {
        await signIn(username, password);
        localStorage.setItem("isLoggedIn", "true");
        localStorage.setItem("loggedInName", username);
        localStorage.setItem("loginTimestamp", Date.now().toString());
        if (onLoginSuccess) {
          onLoginSuccess({ role: 'Admin', name: username });
        } else {
          navigate("/dashboard");
        }
        return;
      } catch (supErr: any) {
        console.warn("Supabase auth fallback error:", supErr);
      }

      setLoginError("Invalid Username or Password!");
    } catch (err: any) {
      setLoginError(err.message || "Login failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Register submission
  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError("");

    if (!regName || !regUsername || !regPassword) {
      setRegisterError("Please fill all required fields");
      return;
    }

    setIsRegistering(true);
    try {
      await addDoc(collection(db, "employees"), {
        name: regName,
        username: regUsername,
        password: regPassword,
        status: "Pending",
        createdAt: new Date().toISOString(),
      });

      toast({
        title: "Registration Request Sent!",
        description: "Account created! Pending administrator approval.",
      });

      // Clear fields and smoothly flip back to Login page
      setRegName("");
      setRegUsername("");
      setRegPassword("");
      setTimeout(() => {
        setIsFlipped(false);
      }, 500);
    } catch (err: any) {
      setRegisterError("Failed to register. Please try again.");
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div 
      className="min-h-[100dvh] flex items-center justify-center p-3 sm:p-6 md:p-8 select-none relative overflow-x-hidden overflow-y-auto"
      style={{
        backgroundColor: "#060a14",
        backgroundImage: `
          radial-gradient(circle at 18% 40%, rgba(217, 169, 40, 0.14) 0%, transparent 45%),
          radial-gradient(circle at 82% 60%, rgba(30, 58, 110, 0.28) 0%, transparent 50%),
          radial-gradient(ellipse at 50% 50%, #0c1427 0%, #060a14 100%)
        `
      }}
    >
      {/* Main Split Card Container - Responsive Aspect Ratio (16:10 Laptop Perfect Ratio) */}
      <div className="laptop-auth-card w-full max-w-[1020px] rounded-2xl sm:rounded-[2rem] shadow-[0_25px_80px_rgba(0,0,0,0.65),0_0_50px_rgba(0,0,0,0.4)] flex flex-col md:flex-row overflow-hidden border border-white/15 relative z-10 my-auto transition-all duration-300">
        
        {/* ================= LEFT SIDE (Rich Champagne Gold Branding: #D9A928) ================= */}
        <div className="w-full md:w-1/2 relative bg-[#D9A928] flex flex-col items-center justify-center p-4 sm:p-6 md:p-8 text-center overflow-hidden min-h-[200px] sm:min-h-[240px] md:min-h-auto flex-shrink-0">
          
          {/* Subtle Dynamic Bottom Waves: #E4BE5C */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {/* Wave 1 */}
            <svg 
              viewBox="0 0 500 500" 
              preserveAspectRatio="none" 
              className="absolute bottom-0 left-0 w-full h-[52%] opacity-60"
            >
              <path 
                d="M0,280 C150,210 270,330 420,260 C460,240 480,245 500,255 L500,500 L0,500 Z" 
                fill="#E4BE5C" 
              />
            </svg>

            {/* Wave 2 */}
            <svg 
              viewBox="0 0 500 500" 
              preserveAspectRatio="none" 
              className="absolute bottom-0 left-0 w-full h-[40%] opacity-90"
            >
              <path 
                d="M0,340 C140,260 300,380 500,300 L500,500 L0,500 Z" 
                fill="#E4BE5C" 
              />
            </svg>

            {/* Wave 3 */}
            <svg 
              viewBox="0 0 500 500" 
              preserveAspectRatio="none" 
              className="absolute bottom-0 left-0 w-full h-[26%] opacity-100"
            >
              <path 
                d="M0,400 C160,330 340,420 500,360 L500,500 L0,500 Z" 
                fill="#E4BE5C" 
              />
            </svg>
          </div>
          
          {/* Left Panel Content */}
          <div className="relative z-10 flex flex-col items-center max-w-[340px] px-2">
            {/* Logo Badge Container */}
            <div className="laptop-auth-logo w-[90px] h-[90px] sm:w-[130px] sm:h-[130px] md:w-[clamp(110px,15vh,175px)] md:h-[clamp(110px,15vh,175px)] p-2 flex items-center justify-center mb-2 sm:mb-4 rounded-2xl sm:rounded-[1.5rem] overflow-hidden shadow-[0_16px_35px_rgba(0,0,0,0.32)] bg-black border border-[#F1D27A]/30 relative group transition-transform duration-500 hover:scale-[1.02]">
              <img 
                src="/logo.jpeg" 
                alt="Sabi Return Gifts" 
                className="w-full h-full object-cover rounded-xl sm:rounded-[1.25rem]" 
              />
            </div>
            
            {/* Brand Titles: Ivory White #F8F5ED */}
            <h1 className="laptop-auth-brand-title text-xl sm:text-2xl md:text-[clamp(22px,2.6vh,30px)] font-serif font-bold text-[#F8F5ED] tracking-wider mb-0.5 sm:mb-1 drop-shadow-md">
              SABI RETURNS
            </h1>
            {/* Subtitle: Soft White #E8EAF0 */}
            <p className="laptop-auth-brand-sub text-[9px] sm:text-[10px] md:text-xs font-bold tracking-[0.25em] sm:tracking-[0.3em] text-[#E8EAF0] mb-1.5 sm:mb-3 uppercase drop-shadow-sm opacity-95">
              PREMIUM GIFTING SOLUTIONS
            </p>
            
            {/* Decorative Line: Champagne #F1D27A */}
            <div className="w-8 sm:w-10 h-[2px] bg-[#F1D27A] mb-1.5 sm:mb-3 rounded-full shadow-sm"></div>
            
            {/* Tagline: Soft White #E8EAF0 */}
            <p className="laptop-auth-tagline text-[#E8EAF0] text-[10px] sm:text-[11px] md:text-[12px] font-medium px-2 leading-relaxed drop-shadow-sm opacity-95 max-w-[300px]">
              Empowering your celebrations with elegant,<br className="hidden sm:inline" /> secure, and seamless return gift solutions.
            </p>
          </div>
        </div>

        {/* ================= RIGHT SIDE (3D BOOK PAGE FLIP: Deep Navy #080F23 to #101A33) ================= */}
        <div className="w-full md:w-1/2 relative bg-gradient-to-b from-[#101A33] via-[#0C142A] to-[#080F23] book-perspective overflow-hidden">
          
          <div className={`book-card-inner ${isFlipped ? "is-flipped" : ""}`}>
            
            {/* ---------------- FRONT PAGE: LOGIN ---------------- */}
            <div className="book-face laptop-auth-right-panel p-4 sm:p-6 md:p-8 lg:p-10 flex flex-col justify-center">
              <div className="max-w-[360px] w-full mx-auto space-y-3.5 sm:space-y-5 md:space-y-6">
                
                {/* Header: Ivory White #F8F5ED & Muted Blue-Gray #9DAAC2 */}
                <div className="text-center space-y-0.5 sm:space-y-1">
                  <h2 className="laptop-auth-heading text-xl sm:text-2xl md:text-[clamp(24px,3vh,32px)] font-serif font-bold text-[#F8F5ED] tracking-wide drop-shadow-md">
                    Login
                  </h2>
                  <p className="laptop-auth-subtext text-[#9DAAC2] text-[11px] sm:text-xs md:text-sm font-medium">
                    Sign in to your Sabi Returns account
                  </p>
                </div>

                {/* Error Message Display */}
                {loginError && (
                  <div className="bg-red-500/15 border border-red-500/40 text-red-300 text-xs sm:text-sm font-medium px-3.5 py-2 rounded-xl text-center">
                    {loginError}
                  </div>
                )}

                {/* Login Form */}
                <form onSubmit={handleLoginSubmit} className="space-y-4 sm:space-y-5">
                  <div className="space-y-3 sm:space-y-3.5">
                    
                    {/* Username Input */}
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                        <User className="h-4.5 w-4.5 text-[#D9A628] transition-colors group-focus-within:text-[#F0C64A]" />
                      </div>
                      <input 
                        id="username" 
                        type="text"
                        value={username} 
                        onChange={(e) => setUsername(e.target.value)} 
                        placeholder="Username" 
                        required 
                        autoComplete="username"
                        className="laptop-auth-input w-full pl-11 pr-4 h-[clamp(42px,5vh,48px)] bg-[#131d35] border border-[#223354] focus:border-[#D9A628] focus:ring-1 focus:ring-[#D9A628] rounded-xl text-[#E8EAF0] placeholder-[#8995AA] text-xs sm:text-sm font-medium outline-none focus:outline-none transition-all duration-200 shadow-inner"
                      />
                    </div>
                    
                    {/* Password Input */}
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                        <Lock className="h-4.5 w-4.5 text-[#D9A628] transition-colors group-focus-within:text-[#F0C64A]" />
                      </div>
                      <input 
                        id="password" 
                        type={showPassword ? "text" : "password"} 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        placeholder="Password" 
                        required 
                        autoComplete="current-password"
                        className="laptop-auth-input w-full pl-11 pr-11 h-[clamp(42px,5vh,48px)] bg-[#131d35] border border-[#223354] focus:border-[#D9A628] focus:ring-1 focus:ring-[#D9A628] rounded-xl text-[#E8EAF0] placeholder-[#8995AA] text-xs sm:text-sm font-medium outline-none focus:outline-none transition-all duration-200 shadow-inner"
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#D9A628] hover:text-[#E8BD45] transition-colors cursor-pointer"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Options Row: Remember Me & Register button (perfectly aligned with box edges) */}
                  <div className="flex items-center justify-between px-0.5 pt-0.5">
                    <div className="flex items-center space-x-2">
                      <Checkbox 
                        id="remember" 
                        checked={rememberMe}
                        onCheckedChange={(checked) => setRememberMe(!!checked)}
                        className="w-4 h-4 rounded border-[#223354] data-[state=checked]:bg-[#D9A628] data-[state=checked]:border-[#D9A628] data-[state=checked]:text-white focus-visible:ring-1 focus-visible:ring-[#D9A628]" 
                      />
                      <label
                        htmlFor="remember"
                        className="text-xs sm:text-sm font-medium leading-none text-[#E8EAF0] cursor-pointer hover:text-white transition-colors select-none"
                      >
                        Remember Me?
                      </label>
                    </div>

                    {/* Book Flip to Register Page */}
                    <button
                      type="button"
                      onClick={() => setIsFlipped(true)}
                      className="text-xs sm:text-sm font-semibold text-[#D9A628] hover:text-[#E8BD45] transition-colors underline underline-offset-4 cursor-pointer"
                    >
                      Register
                    </button>
                  </div>

                  {/* Action Button: Luxury Gold #D9A628 */}
                  <div className="pt-1.5 flex justify-center">
                    <Button 
                      type="submit" 
                      disabled={isLoading}
                      className="laptop-auth-btn w-full sm:w-48 h-[clamp(42px,5vh,48px)] min-h-[42px] bg-[#D9A628] hover:bg-[#E8BD45] text-white font-bold rounded-full shadow-[0_8px_25px_rgba(217,166,40,0.5)] hover:shadow-[0_12px_32px_rgba(232,189,69,0.65)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 text-xs sm:text-sm tracking-wide border-none cursor-pointer flex items-center justify-center touch-friendly-btn"
                    >
                      {isLoading ? "Logging In..." : "Log In"}
                    </Button>
                  </div>
                  
                </form>
              </div>
            </div>

            {/* ---------------- BACK PAGE: REGISTER (3D Book Turned View) ---------------- */}
            <div className="book-face-back laptop-auth-right-panel p-4 sm:p-6 md:p-8 lg:p-10 flex flex-col justify-center">
              <div className="max-w-[360px] w-full mx-auto space-y-3.5 sm:space-y-4 md:space-y-5">
                
                {/* Header: Ivory White #F8F5ED */}
                <div className="text-center space-y-0.5 sm:space-y-1">
                  <h2 className="laptop-auth-heading text-xl sm:text-2xl md:text-[clamp(24px,3vh,32px)] font-serif font-bold text-[#F8F5ED] tracking-wide drop-shadow-md">
                    Register
                  </h2>
                  <p className="laptop-auth-subtext text-[#9DAAC2] text-[11px] sm:text-xs md:text-sm font-medium">
                    Create your Sabi Returns account
                  </p>
                </div>

                {/* Error Message Display */}
                {registerError && (
                  <div className="bg-red-500/15 border border-red-500/40 text-red-300 text-xs sm:text-sm font-medium px-3.5 py-2 rounded-xl text-center">
                    {registerError}
                  </div>
                )}

                {/* Register Form */}
                <form onSubmit={handleRegisterSubmit} className="space-y-3.5 sm:space-y-4">
                  <div className="space-y-2.5 sm:space-y-3">
                    
                    {/* Full Name Input */}
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                        <User className="h-4.5 w-4.5 text-[#D9A628] transition-colors group-focus-within:text-[#F0C64A]" />
                      </div>
                      <input 
                        id="reg-name" 
                        type="text"
                        value={regName} 
                        onChange={(e) => setRegName(e.target.value)} 
                        placeholder="Full Name" 
                        required 
                        className="laptop-auth-input w-full pl-11 pr-4 h-[clamp(40px,4.8vh,46px)] bg-[#131d35] border border-[#223354] focus:border-[#D9A628] focus:ring-1 focus:ring-[#D9A628] rounded-xl text-[#E8EAF0] placeholder-[#8995AA] text-xs sm:text-sm font-medium outline-none focus:outline-none transition-all duration-200 shadow-inner"
                      />
                    </div>

                    {/* Username Input */}
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                        <User className="h-4.5 w-4.5 text-[#D9A628] transition-colors group-focus-within:text-[#F0C64A]" />
                      </div>
                      <input 
                        id="reg-username" 
                        type="text"
                        value={regUsername} 
                        onChange={(e) => setRegUsername(e.target.value)} 
                        placeholder="Username" 
                        required 
                        autoComplete="username"
                        className="laptop-auth-input w-full pl-11 pr-4 h-[clamp(40px,4.8vh,46px)] bg-[#131d35] border border-[#223354] focus:border-[#D9A628] focus:ring-1 focus:ring-[#D9A628] rounded-xl text-[#E8EAF0] placeholder-[#8995AA] text-xs sm:text-sm font-medium outline-none focus:outline-none transition-all duration-200 shadow-inner"
                      />
                    </div>
                    
                    {/* Password Input */}
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none">
                        <Lock className="h-4.5 w-4.5 text-[#D9A628] transition-colors group-focus-within:text-[#F0C64A]" />
                      </div>
                      <input 
                        id="reg-password" 
                        type={showRegPassword ? "text" : "password"} 
                        value={regPassword} 
                        onChange={(e) => setRegPassword(e.target.value)} 
                        placeholder="Password" 
                        required 
                        className="laptop-auth-input w-full pl-11 pr-11 h-[clamp(40px,4.8vh,46px)] bg-[#131d35] border border-[#223354] focus:border-[#D9A628] focus:ring-1 focus:ring-[#D9A628] rounded-xl text-[#E8EAF0] placeholder-[#8995AA] text-xs sm:text-sm font-medium outline-none focus:outline-none transition-all duration-200 shadow-inner"
                      />
                      <button 
                        type="button" 
                        onClick={() => setShowRegPassword(!showRegPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-[#D9A628] hover:text-[#E8BD45] transition-colors cursor-pointer"
                        aria-label={showRegPassword ? "Hide password" : "Show password"}
                      >
                        {showRegPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Flip Back to Login Row (perfectly aligned with box edges) */}
                  <div className="flex items-center justify-between px-0.5 pt-0.5">
                    <span className="text-xs sm:text-sm text-[#9DAAC2] font-medium">
                      Already have an account?
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsFlipped(false)}
                      className="text-xs sm:text-sm font-semibold text-[#D9A628] hover:text-[#E8BD45] transition-colors underline underline-offset-4 cursor-pointer"
                    >
                      Login
                    </button>
                  </div>

                  {/* Action Button */}
                  <div className="pt-1.5 flex justify-center">
                    <Button 
                      type="submit" 
                      disabled={isRegistering}
                      className="laptop-auth-btn w-full sm:w-48 h-[clamp(42px,5vh,48px)] min-h-[42px] bg-[#D9A628] hover:bg-[#E8BD45] text-white font-bold rounded-full shadow-[0_8px_25px_rgba(217,166,40,0.5)] hover:shadow-[0_12px_32px_rgba(232,189,69,0.65)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 text-xs sm:text-sm tracking-wide border-none cursor-pointer flex items-center justify-center touch-friendly-btn"
                    >
                      {isRegistering ? "Creating..." : "Create Account"}
                    </Button>
                  </div>
                  
                </form>
              </div>
            </div>

          </div>
        </div>

      </div>

    </div>
  );
};

export default Login;
