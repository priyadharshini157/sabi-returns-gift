// ==========================================
// 5 STEPS INTEGRATION
// Step 1: Ensure dependencies are installed -> `npm install firebase lucide-react recharts xlsx html2canvas`
// Step 2: Verify Firebase config credentials match your Firebase Console.
// Step 3: Update Firestore database rules to allow read/write during development.
// Step 4: Ensure TailwindCSS is fully set up in your tailwind.config.js for styling.
// Step 5: Start the application using `npm start` or `npm run dev`.
// ==========================================

import React, { useState, useMemo, useRef, useEffect } from "react";
// --- FIREBASE SINGLETON & CONCURRENCY IMPORTS ---
import { db } from "@/firebase";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query, orderBy, setDoc
} from "firebase/firestore";
import { useDebounce } from "@/hooks/useDebounce";
import { getNextSequentialOrderId } from "@/lib/concurrency";
// -----------------------------------------------

import {
  Home, User, Plus, Download, Eye, EyeOff, Pencil, Trash2, Calendar, CheckCircle, Clock, ShoppingBag, Search, TrendingUp, Package, MapPin, X, IndianRupee, Menu, Filter, Camera, Power, Lock, MessageSquare, MessageCircle, Share2, Upload, MoreVertical, Truck, ChevronDown, Archive, Book, Receipt, ChevronLeft, ChevronRight, DollarSign, Settings, History, ClipboardList,
  Bell, Gift, Image as ImageIcon, CheckSquare, Square, RotateCcw, Target, Check, Tag, Loader2, Boxes, Layers
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, ComposedChart, Line } from 'recharts';
import OrderInvoiceView from "@/components/OrderInvoiceView";
import DailyTasksBoard from "@/components/DailyTasksBoard";
import MonthlyWinnerPicker from "@/components/MonthlyWinnerPicker";
import AttendanceLog from "@/components/AttendanceLog";
import Login from "./Login";
import { toast } from 'sonner';
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { formatPhoneNumber } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { uploadToCloudinary, uploadMultipleToCloudinary } from "@/lib/cloudinary";

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#ffc658', '#ff7300'];

const CHOCOLATE_PRICES_MAP: Record<string, { retail: number; wholesale: number }> = {
  "10 rs 5 star": { retail: 22, wholesale: 9 },
  "10 rs kitkat": { retail: 20, wholesale: 20 },
  "10 rs dairy milk": { retail: 20, wholesale: 9 },
  "5 rs peanut candy": { retail: 17, wholesale: 17 },
  "5 rs 5 star": { retail: 15, wholesale: 15 },
  "5 rs dairy milk": { retail: 15, wholesale: 15 },
  "2 rs dairymilk shots": { retail: 10, wholesale: 10 },
  "5 rs milky bar": { retail: 10, wholesale: 10 },
  "1 rs chocolate": { retail: 8, wholesale: 8 },
  // Keep legacy options for safety and parsing existing orders:
  "kitkat": { retail: 20, wholesale: 18 },
  "dairy milk": { retail: 15, wholesale: 13 },
  "dairymilk": { retail: 15, wholesale: 13 },
  "peanut candy": { retail: 17, wholesale: 15 },
  "5 star": { retail: 15, wholesale: 13 },
  "dairymilk shots": { retail: 10, wholesale: 8 },
  "milky bar": { retail: 10, wholesale: 8 },
  "snickers": { retail: 20, wholesale: 18 },
  "bounty": { retail: 20, wholesale: 18 },
  "munch": { retail: 10, wholesale: 8 },
  "perk": { retail: 10, wholesale: 8 },
  "ferrero rocher": { retail: 50, wholesale: 45 },
  "toblerone": { retail: 50, wholesale: 45 },
  "kinder joy": { retail: 40, wholesale: 35 },
  "hershey's": { retail: 30, wholesale: 25 },
  "gems": { retail: 10, wholesale: 8 },
};

const normalizePhone = (phoneStr: any) => {
  if (!phoneStr) return "";
  const cleaned = String(phoneStr).replace(/\D/g, "");
  if (cleaned.length > 10 && cleaned.startsWith("91")) {
    return cleaned.slice(-10);
  }
  return cleaned;
};

const CHOCOLATE_PURCHASE_MAP: Record<string, number> = {
  "10 rs 5 star": 9.5,
  "10 rs kitkat": 9.5,
  "10 rs dairy milk": 9.5,
  "5 rs peanut candy": 4.5,
  "5 rs 5 star": 4.5,
  "5 rs dairy milk": 4.5,
  "2 rs dairymilk shots": 1.5,
  "5 rs milky bar": 4.5,
  "1 rs chocolate": 0.5,
  // Keep legacy mappings:
  "dairymilk": 4.5, "dairy milk": 4.5, "5 star": 4.5, "kitkat": 9.5,
  "dairymilk shots": 1.5, "peanut candy": 4.5,
  "milky bar": 4.5,
  "snickers": 10, "bounty": 10, "munch": 5, "perk": 5
};

const TRACKED_INVENTORY = [
  "10 rs 5 Star", "10 rs Kitkat", "10 rs Dairy Milk", "5 rs Peanut Candy",
  "5 rs 5 Star", "5 rs Dairy Milk", "2 rs Dairymilk Shots", "5 rs Milky Bar",
  "1 rs Chocolate"
];

// --- SHARED UTILS ---
const normalizeChocName = (name: string, dynamicInventory: string[] = []) => {
  const lower = name.trim().toLowerCase();
  if (lower === 'dairymilk') return 'Dairy Milk';
  if (lower === 'dairy milk') return 'Dairy Milk';
  if (lower === '10 rs dairymilk') return '10 rs Dairy Milk';
  if (lower === '10 rs dairy milk') return '10 rs Dairy Milk';

  const inventoryToSearch = dynamicInventory.length > 0 ? dynamicInventory : [
    "Kitkat", "Dairy Milk", "Peanut Candy", "5 Star",
    "10 rs Dairy Milk", "Dairymilk Shots", "10 rs 5 Star", "Milky Bar"
  ];

  const found = inventoryToSearch.find(t => t.toLowerCase() === lower);
  return found || name.trim();
};


const calculatePriceInfo = (chocolateString: string, count: number | string, discountValue: number | string = 0, isDeliveryFree: boolean = false, paymentStatus: string = "Full Paid", category: string = "chocolate", customPricesMap: Record<string, number> = {}, manualDeliveryFee: number | string = 0, orderStatus: string = "", managedChocPricesMap: Record<string, { retail: number; wholesale: number }> = {}, pricingType: 'retail' | 'wholesale' = 'retail', manualProductPrice: number | string = 0) => {

  const chocs = String(chocolateString || "").split(',').map(c => c.trim()).filter(Boolean);
  const countParts = String(count || "0").split(',').map(c => Number(c.trim()) || 0);
  const chocCounts = chocs.map((c, i) => countParts[i] !== undefined ? countParts[i] : (countParts[0] || 0));
  const totalQuantity = chocCounts.reduce((sum, val) => sum + val, 0);

  if (!chocolateString || totalQuantity === 0) return { unitPrice: 0, chocolatePrice: 0, deliveryCharge: 0, discount: 0, totalPrice: 0, revenue: 0, fullChocolatePrice: 0, fullDeliveryCharge: 0, fullTotalPrice: 0, fullRevenue: 0 };

  let baseChocolatePrice = 0;
  chocs.forEach((c, idx) => {
    const qty = chocCounts[idx] || 0;
    if (category === 'product') {
      const price = (customPricesMap[c.toLowerCase()] || 0);
      baseChocolatePrice += price * qty;
    } else {
      const priceObj = managedChocPricesMap[c.toLowerCase()] || CHOCOLATE_PRICES_MAP[c.toLowerCase()] || { retail: 0, wholesale: 0 };
      const price = priceObj[pricingType] || 0;
      baseChocolatePrice += price * qty;
    }
  });

  let unitPrice = 0;
  if (totalQuantity > 0) {
    unitPrice = baseChocolatePrice / totalQuantity;
  }

  // Use manualProductPrice as unitPrice if provided (for Dashboard 2)
  if (category === 'product' && Number(manualProductPrice) > 0) {
    unitPrice = Number(manualProductPrice);
    baseChocolatePrice = Number((unitPrice * totalQuantity).toFixed(2));
  }

  let baseDeliveryCharge = 0;
  if (isDeliveryFree) {
    baseDeliveryCharge = 0;
  } else if (Number(manualDeliveryFee) > 0) {
    baseDeliveryCharge = Number(manualDeliveryFee);
  } else if (category === 'product') {
    baseDeliveryCharge = 0;
  } else {
    baseDeliveryCharge = totalQuantity > 99 ? 200 : 150;
  }

  const baseDiscountAmt = Number(discountValue) || 0;

  const rawTotal = Math.max(0, baseChocolatePrice + baseDeliveryCharge - baseDiscountAmt);

  // Cancelled orders should show zero prices
  const isCancelled = orderStatus === 'cancelled';

  const chocolatePrice = isCancelled ? 0 : Math.round(baseChocolatePrice);
  const deliveryCharge = isCancelled ? 0 : Math.round(baseDeliveryCharge);
  const discount = isCancelled ? 0 : Math.round(baseDiscountAmt);
  const finalTotal = isCancelled ? 0 : Math.round(rawTotal);

  const rawRevenue = Math.max(0, baseChocolatePrice - baseDiscountAmt);
  const revenue = isCancelled ? 0 : Math.round(rawRevenue);
  const fullRevenue = Math.round(rawRevenue);

  return {
    unitPrice: Number(unitPrice.toFixed(2)),
    chocolatePrice,
    deliveryCharge,
    discount,
    totalPrice: finalTotal,
    revenue,
    fullChocolatePrice: Math.round(baseChocolatePrice),
    fullDeliveryCharge: Math.round(baseDeliveryCharge),
    fullTotalPrice: Math.round(rawTotal),
    fullRevenue
  };
};


const calculateOrderFinalCost = (
  order: any,
  managedChocPricesMap: Record<string, { retail: number; wholesale: number }>,
  managedChocStickersMap: Record<string, number>,
  customPricesMap: Record<string, number>,
  countOverride?: number
) => {
  const category = order.category || "chocolate";
  const chocolateName = order.chocolate || "N/A";

  const chocs = String(chocolateName).split(',').map(c => c.trim()).filter(Boolean);
  const countStr = String(order.count || "0");
  const countParts = countStr.split(',').map(c => Number(c.trim()) || 0);
  const chocCounts = chocs.map((c, i) => countParts[i] !== undefined ? countParts[i] : (countParts[0] || 0));
  const totalCount = countOverride !== undefined ? countOverride : chocCounts.reduce((sum, val) => sum + val, 0);

  let totalPurchase = 0;
  let stickerCost = 0;
  let labourCost = 0;

  if (category === 'product') {
    const qty = totalCount;
    const key = String(order.chocolate || "").toLowerCase();
    const baseProductPrice = Number(order.manualProductPrice) || customPricesMap[key] || 0;
    const purchasePricePerItem = baseProductPrice * 0.7;
    totalPurchase = purchasePricePerItem * qty;
    stickerCost = 0;
    labourCost = 0;
  } else {
    chocs.forEach((c, idx) => {
      const key = c.toLowerCase();
      const qty = chocCounts[idx] || 0;

      const purchasePricePerItem = managedChocPricesMap[key]?.wholesale || CHOCOLATE_PRICES_MAP[key]?.wholesale || 0;
      totalPurchase += purchasePricePerItem * qty;

      const stickerPricePerItem = managedChocStickersMap[key] !== undefined ? managedChocStickersMap[key] : 1.5;
      stickerCost += qty * stickerPricePerItem;

      labourCost += qty * 1;
    });
  }

  const finalCost = stickerCost + labourCost + totalPurchase;

  return {
    count: totalCount,
    purchasePricePerItem: totalCount > 0 ? totalPurchase / totalCount : 0,
    stickerPricePerItem: totalCount > 0 ? stickerCost / totalCount : 1.5,
    stickerCost,
    labourCost,
    totalPurchase,
    finalCost
  };
};



const parseDateToYYYYMMDD = (displayDate: string) => {
  if (!displayDate) return "";
  if (String(displayDate).includes("-")) return displayDate;
  const currentYear = new Date().getFullYear();
  const d = new Date(`${displayDate} ${currentYear}`);
  if (isNaN(d.getTime())) return "";
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
};

const formatToDisplayDate = (dateStr: any) => {
  if (!dateStr) return "";
  if (typeof dateStr === 'number') {
    const date = new Date(Math.round((dateStr - 25569) * 86400 * 1000));
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  if (typeof dateStr === 'string') {
    const str = dateStr.trim();
    if (/^\d{1,2}\s+[a-zA-Z]{3}$/.test(str)) return str;
    if (!str.includes("-") && !str.includes("/")) return str;
    const date = new Date(str);
    if (!isNaN(date.getTime())) return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
  return String(dateStr);
};

const renderScreenshotLocation = (order: any) => {
  const rawLoc = String(order.location || '').trim();
  const addrStr = String(order.address || '').trim();
  const remStr = String(order.remarks || order.comments || '').trim();
  const combined = `${rawLoc} ${addrStr} ${remStr}`.trim();
  const lower = combined.toLowerCase();

  if (order.isChennai === true || rawLoc.toLowerCase() === 'chennai' || lower.includes('chennai') || lower.includes('madras')) {
    return <span className="screenshot-location-text screenshot-location-chennai font-bold">Chennai</span>;
  }
  if (rawLoc.toLowerCase() === 'kerala' || lower.includes('kerala') || lower.includes('kochi') || lower.includes('trivandrum') || lower.includes('ernakulam') || lower.includes('calicut')) {
    return <span className="screenshot-location-text screenshot-location-kerala font-bold">Kerala</span>;
  }

  const knownCities = [
    'Madurai', 'Coimbatore', 'Trichy', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 
    'Erode', 'Vellore', 'Thanjavur', 'Tuticorin', 'Thoothukudi', 'Nagercoil', 
    'Kanyakumari', 'Dindigul', 'Karur', 'Cuddalore', 'Kanchipuram', 'Tiruppur', 
    'Hosur', 'Puducherry', 'Pondicherry', 'Karaikal', 'Ramanathapuram', 'Ramnad', 
    'Virudhunagar', 'Sivakasi', 'Tenkasi', 'Namakkal', 'Villupuram'
  ];

  for (const city of knownCities) {
    if (lower.includes(city.toLowerCase())) {
      return <span className="screenshot-location-text screenshot-location-others font-bold">{city}</span>;
    }
  }

  if (rawLoc && rawLoc.toLowerCase() !== 'others') {
    return <span className="screenshot-location-text screenshot-location-others font-bold">{rawLoc}</span>;
  }

  return <span className="screenshot-location-text screenshot-location-empty font-bold">—</span>;
};

const PREDEFINED_CHOCOLATES = [
  "10 rs 5 Star", "10 rs Kitkat", "10 rs Dairy Milk", "5 rs Peanut Candy",
  "5 rs 5 Star", "5 rs Dairy Milk", "2 rs Dairymilk Shots", "5 rs Milky Bar",
  "1 rs Chocolate"
];
const ChocolateSingleSelect = ({
  value,
  onChange,
  suggestions,
  pricesMap,
  placeholderText = "Select chocolate..."
}: {
  value: string;
  onChange: (val: string) => void;
  suggestions: string[];
  pricesMap?: Record<string, { retail: number; wholesale: number } | number>;
  placeholderText?: string;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filteredSuggestions = useMemo(() => {
    if (!searchQuery.trim()) return suggestions;
    const q = searchQuery.trim().toLowerCase();
    return suggestions.filter(item => item.toLowerCase().includes(q));
  }, [suggestions, searchQuery]);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <button
        type="button"
        onClick={() => { setIsOpen(!isOpen); if (isOpen) setSearchQuery(""); }}
        style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
        className="w-full text-sm font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white shadow-inner flex justify-between items-center text-left cursor-pointer transition-all hover:border-amber-400/50"
      >
        <span className={`truncate pr-2 ${value ? 'text-white font-extrabold' : 'text-slate-400 font-medium'}`}>
          {value ? value : placeholderText}
        </span>
        <ChevronDown size={18} className="text-slate-400 shrink-0 transition-transform duration-200" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>

      {isOpen && (
        <div className="absolute z-[250] w-full mt-1.5 bg-[#121a2d] border border-white/20 shadow-2xl max-h-60 overflow-hidden rounded-xl text-left backdrop-blur-xl custom-scrollbar animate-in fade-in zoom-in-95 duration-150 flex flex-col">
          {/* Search Input */}
          <div className="px-2.5 py-2 border-b border-white/15 shrink-0 sticky top-0 bg-[#121a2d] z-10">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="w-full pl-8 pr-3 py-1.5 bg-[#1a2540] border border-white/15 rounded-lg text-xs font-bold text-white placeholder:text-slate-500 outline-none focus:border-amber-400/60 transition-colors"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 py-1 custom-scrollbar">
            <div
              className="px-3.5 py-2 cursor-pointer hover:bg-amber-500/20 hover:text-amber-300 text-slate-400 text-xs font-semibold select-none transition-colors border-b border-white/10"
              onClick={() => {
                onChange("");
                setIsOpen(false);
                setSearchQuery("");
              }}
            >
              {placeholderText}
            </div>
            {filteredSuggestions.length === 0 && (
              <div className="px-3.5 py-3 text-xs text-slate-500 text-center font-medium">No results found</div>
            )}
            {filteredSuggestions.map((item, index) => {
              const isSelected = value === item;
              return (
                <div
                  key={index}
                  className={`px-3.5 py-2.5 cursor-pointer text-sm font-semibold select-none transition-colors border-b border-white/5 last:border-0 ${isSelected
                      ? 'bg-amber-500/20 text-amber-300 font-extrabold'
                      : 'text-slate-200 hover:bg-amber-500/15 hover:text-amber-300'
                    }`}
                  onClick={() => {
                    onChange(item);
                    setIsOpen(false);
                    setSearchQuery("");
                  }}
                >
                  {item}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default function Dashboard() {
  const { profile, signOut: supabaseSignOut } = useAuth();
  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('isLoggedIn') === 'true');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loggedInName, setLoggedInName] = useState(() => localStorage.getItem('loggedInName') || profile?.username || "");
  const [role, setRole] = useState<'Admin' | 'Employee'>(() => (localStorage.getItem('role') as any) || 'Admin');
  const [employeeId, setEmployeeId] = useState(() => localStorage.getItem('employeeId') || "");
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<any>(null);
  const [headerActionOpen, setHeaderActionOpen] = useState(false);
  const [showAmounts, setShowAmounts] = useState<boolean>(false);

  const maskAmount = (val: string | number) => {
    if (showAmounts) {
      if (typeof val === 'number') return `₹${val.toLocaleString()}`;
      return String(val).startsWith('₹') ? val : `₹${val}`;
    }
    return '₹••••••';
  };

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [adminDateType, setAdminDateType] = useState<string>('Dispatch Date');
  const [adminDateRange, setAdminDateRange] = useState({ from: "", to: "" });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;


  const [adminReportDash, setAdminReportDash] = useState<'None' | 'Dashboard 1' | 'Dashboard 2' | 'All'>('None');
  const [adminReportMenuOpen, setAdminReportMenuOpen] = useState(false);

  // Separate states for Inventories Cost Analytics settings to prevent linkage
  const [invAdminDateType, setInvAdminDateType] = useState<string>('Dispatch Date');
  const [invAdminDateRange, setInvAdminDateRange] = useState({ from: "", to: "" });
  const [invAdminReportDash, setInvAdminReportDash] = useState<'None' | 'Dashboard 1' | 'Dashboard 2' | 'All'>('None');
  const [invAdminReportMenuOpen, setInvAdminReportMenuOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<any[]>([]);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const jumpToActions = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ left: tableContainerRef.current.scrollWidth, behavior: 'smooth' });
    }
  };

  const jumpToSerial = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  const [customProducts, setCustomProducts] = useState<any[]>([]);
  const [isAddProductModalOpen, setIsAddProductModalOpen] = useState(false);
  const [newProductForm, setNewProductForm] = useState({ name: "", wholesalePrice: "", price: "", productType: "Single product" });
  const [productTypeFilter, setProductTypeFilter] = useState<string>("all");
  const [newProductImages, setNewProductImages] = useState<File[]>([]);
  const [newProductExistingImages, setNewProductExistingImages] = useState<string[]>([]);
  const [isSavingProduct, setIsSavingProduct] = useState(false);
  const [editProductId, setEditProductId] = useState<string | null>(null);
  const [continuousVisibleCount, setContinuousVisibleCount] = useState(10);

  const DEFAULT_CHOCOLATES = [
    { name: "10 rs 5 Star", retailPrice: 22, wholesalePrice: 9, costPrice: 9.5, stickerPrice: 1.5, displayOrder: 1 },
    { name: "10 rs Kitkat", retailPrice: 20, wholesalePrice: 20, costPrice: 9.5, stickerPrice: 1.5, displayOrder: 2 },
    { name: "10 rs Dairy Milk", retailPrice: 20, wholesalePrice: 9, costPrice: 9.5, stickerPrice: 1.5, displayOrder: 3 },
    { name: "5 rs Peanut Candy", retailPrice: 17, wholesalePrice: 17, costPrice: 4.5, stickerPrice: 1.5, displayOrder: 4 },
    { name: "5 rs 5 Star", retailPrice: 15, wholesalePrice: 15, costPrice: 4.5, stickerPrice: 1.5, displayOrder: 5 },
    { name: "5 rs Dairy Milk", retailPrice: 15, wholesalePrice: 15, costPrice: 4.5, stickerPrice: 1.5, displayOrder: 6 },
    { name: "2 rs Dairymilk Shots", retailPrice: 10, wholesalePrice: 10, costPrice: 1.5, stickerPrice: 1.5, displayOrder: 7 },
    { name: "5 rs Milky Bar", retailPrice: 10, wholesalePrice: 10, costPrice: 4.5, stickerPrice: 1.5, displayOrder: 8 },
    { name: "1 rs Chocolate", retailPrice: 8, wholesalePrice: 8, costPrice: 0.5, stickerPrice: 1.5, displayOrder: 9 }
  ];

  const [managedChocolates, setManagedChocolates] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('sabi_managed_chocolates');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_CHOCOLATES.map((c, i) => ({ fireId: `init-${i + 1}`, ...c }));
  });
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [analyticsActiveTab, setAnalyticsActiveTab] = useState<'chocolates' | 'order_types'>('order_types');
  // Safe order type helpers (guarantees zero runtime crashes regardless of string or object shape)
  const getOrderTypeName = (ot: any): string => {
    if (!ot) return '';
    if (typeof ot === 'string') return ot.trim();
    return String(ot.name || ot.orderType || ot.label || ot.title || '').trim();
  };

  const getOrderTypeId = (ot: any, index: number): string => {
    if (!ot) return `ot-${index}`;
    if (typeof ot === 'string') return `ot-${ot.trim().toLowerCase().replace(/\s+/g, '-')}-${index}`;
    return String(ot.fireId || ot.id || `ot-${index}`);
  };

  const [orderTypes, setOrderTypes] = useState<{ fireId: string; name: string }[]>(() => {
    try {
      const saved = localStorage.getItem('sabi_order_types');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item: any, idx: number) => {
            if (typeof item === 'string') return { fireId: `default-${idx + 1}`, name: item.trim() };
            return {
              fireId: item?.fireId || item?.id || `default-${idx + 1}`,
              name: String(item?.name || item?.orderType || item?.label || `Type ${idx + 1}`).trim()
            };
          });
        }
      }
    } catch (e) {}
    return [
      { fireId: 'default-1', name: 'Sabi' },
      { fireId: 'default-2', name: 'Thaaru' },
      { fireId: 'default-3', name: 'Choco Wrapz' }
    ];
  });
  const [newOrderTypeName, setNewOrderTypeName] = useState("");
  const [editOrderTypeId, setEditOrderTypeId] = useState<string | null>(null);

  const [newChocForm, setNewChocForm] = useState({ name: "", retailPrice: "", wholesalePrice: "", stickerPrice: "1.5", displayOrder: "" });
  const [editChocId, setEditChocId] = useState<string | null>(null);
  const [chocolateRows, setChocolateRows] = useState<{ chocolate: string; count: string }[]>([{ chocolate: "", count: "" }]);
  const [d1SelectedChocolateBoxFilter, setD1SelectedChocolateBoxFilter] = useState<string>("All Chocolates");

  // --- MULTI-PRODUCT ORDER ROWS (Dashboard 2) ---
  const [productRows, setProductRows] = useState<{ productName: string; quantity: string; price: string }[]>([{ productName: "", quantity: "", price: "" }]);

  // --- PRODUCT IMAGE MANAGEMENT ---
  const [imageGalleryProduct, setImageGalleryProduct] = useState<any>(null);
  const [isImageGalleryOpen, setIsImageGalleryOpen] = useState(false);
  const [galleryActiveIndex, setGalleryActiveIndex] = useState(0);
  const [imageUploadingFor, setImageUploadingFor] = useState<string | null>(null);
  const [deleteImageConfirm, setDeleteImageConfirm] = useState<{ productFireId: string; imageIndex: number } | null>(null);

  // Keyboard Left / Right navigation for Image Gallery Modal
  useEffect(() => {
    if (!isImageGalleryOpen || !imageGalleryProduct) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't interfere if user is typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

      const images = imageGalleryProduct.images || [];
      if (images.length <= 1) {
        if (e.key === 'Escape') {
          setIsImageGalleryOpen(false);
          setDeleteImageConfirm(null);
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setGalleryActiveIndex(prev => (prev === 0 ? images.length - 1 : prev - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setGalleryActiveIndex(prev => (prev === images.length - 1 ? 0 : prev + 1));
      } else if (e.key === 'Escape') {
        setIsImageGalleryOpen(false);
        setDeleteImageConfirm(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isImageGalleryOpen, imageGalleryProduct]);

  // --- MONTHLY TARGET STATE & COMPUTATION ---
  const [targetMonthKey, setTargetMonthKey] = useState<string>(() => format(new Date(), "yyyy-MM"));
  const [monthlyTarget, setMonthlyTarget] = useState<number>(() => {
    const currentKey = format(new Date(), "yyyy-MM");
    const saved = localStorage.getItem(`sabi_monthly_target_${currentKey}`);
    return saved ? Number(saved) : 5000;
  });
  const [isEditingTarget, setIsEditingTarget] = useState<boolean>(false);
  const [targetInput, setTargetInput] = useState<string>("");

  useEffect(() => {
    const unsubTarget = onSnapshot(doc(db, "monthly_targets", targetMonthKey), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.targetGoal !== undefined) {
          setMonthlyTarget(Number(data.targetGoal));
          localStorage.setItem(`sabi_monthly_target_${targetMonthKey}`, String(data.targetGoal));
        }
      } else {
        const saved = localStorage.getItem(`sabi_monthly_target_${targetMonthKey}`);
        setMonthlyTarget(saved ? Number(saved) : 5000);
      }
    });
    return () => unsubTarget();
  }, [targetMonthKey]);

  const handleSaveTarget = async () => {
    const val = Number(targetInput);
    if (!isNaN(val) && val >= 0) {
      setMonthlyTarget(val);
      localStorage.setItem(`sabi_monthly_target_${targetMonthKey}`, String(val));
      setIsEditingTarget(false);
      try {
        await setDoc(doc(db, "monthly_targets", targetMonthKey), { targetGoal: val, updatedAt: new Date().toISOString() }, { merge: true });
        toast.success(`Monthly target set to ${val.toLocaleString()}`);
      } catch (e) {
        console.error("Error saving target:", e);
      }
    }
  };



  useEffect(() => {
    const unsubOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
      const ordersList = snapshot.docs.map(doc => {
        const data = doc.data() as any;
        const fallbackRole = data.orderType === 'Self' ? 'Self' : 'Others';
        return {
          fireId: doc.id,
          ...data,
          role: data.role || fallbackRole
        };
      });
      ordersList.sort((a: any, b: any) => b.id - a.id);
      setOrders(ordersList);
    });
    const unsubEmployees = onSnapshot(collection(db, "employees"), (snapshot) => {
      setEmployees(snapshot.docs.map(doc => ({ fireId: doc.id, ...doc.data() })));
    });
    const unsubInventory = onSnapshot(collection(db, "inventory"), (snapshot) => {
      const invList = snapshot.docs.map(doc => ({ fireId: doc.id, ...doc.data() }));
      invList.sort((a: any, b: any) => b.timestamp - a.timestamp);
      setInventoryLogs(invList);
    });
    const unsubProducts = onSnapshot(collection(db, "products"), (snapshot) => {
      setCustomProducts(snapshot.docs.map(doc => ({ fireId: doc.id, ...doc.data() })));
    });
    const unsubManagedChocs = onSnapshot(collection(db, "managed_chocolates"), (snapshot) => {
      let list: any[] = snapshot.docs.map(doc => ({ fireId: doc.id, ...doc.data() }));

      // Auto-detect and migrate old legacy defaults in DB:
      const hasOldDefaults = list.some(item =>
        item.name === "Kitkat" ||
        item.name === "Dairy Milk" ||
        item.name === "Peanut Candy" ||
        item.name === "5 Star" ||
        item.name === "Dairymilk Shots" ||
        item.name === "Milky Bar"
      );

      if (list.length === 0 || hasOldDefaults) {
        // Clear all existing managed_chocolates to reset with correct names/prices matching the user's requirements
        list.forEach(async (item) => {
          try {
            await deleteDoc(doc(db, "managed_chocolates", item.fireId));
          } catch (e) {
            console.error("Error clearing old chocolate item:", e);
          }
        });

        const defaults = [
          { name: "10 rs 5 Star", retailPrice: 22, wholesalePrice: 9, costPrice: 9.5, stickerPrice: 1.5, displayOrder: 1 },
          { name: "10 rs Kitkat", retailPrice: 20, wholesalePrice: 20, costPrice: 9.5, stickerPrice: 1.5, displayOrder: 2 },
          { name: "10 rs Dairy Milk", retailPrice: 20, wholesalePrice: 9, costPrice: 9.5, stickerPrice: 1.5, displayOrder: 3 },
          { name: "5 rs Peanut Candy", retailPrice: 17, wholesalePrice: 17, costPrice: 4.5, stickerPrice: 1.5, displayOrder: 4 },
          { name: "5 rs 5 Star", retailPrice: 15, wholesalePrice: 15, costPrice: 4.5, stickerPrice: 1.5, displayOrder: 5 },
          { name: "5 rs Dairy Milk", retailPrice: 15, wholesalePrice: 15, costPrice: 4.5, stickerPrice: 1.5, displayOrder: 6 },
          { name: "2 rs Dairymilk Shots", retailPrice: 10, wholesalePrice: 10, costPrice: 1.5, stickerPrice: 1.5, displayOrder: 7 },
          { name: "5 rs Milky Bar", retailPrice: 10, wholesalePrice: 10, costPrice: 4.5, stickerPrice: 1.5, displayOrder: 8 },
          { name: "1 rs Chocolate", retailPrice: 8, wholesalePrice: 8, costPrice: 0.5, stickerPrice: 1.5, displayOrder: 9 }
        ];

        defaults.forEach(d => addDoc(collection(db, "managed_chocolates"), d).catch(() => {}));
        const initialList = defaults.map((d, i) => ({ fireId: `init-${i + 1}`, ...d }));
        setManagedChocolates(initialList);
        try {
          localStorage.setItem('sabi_managed_chocolates', JSON.stringify(initialList));
        } catch (e) {}
      } else {
        // Filter duplicates by name (case-insensitive)
        const seen = new Set();
        // Sort to prioritize items with price > 0 during deduplication
        list.sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
        list = list.filter(item => {
          // Normalize name by removing all spaces and converting to lowercase for duplicate check
          const normalized = item.name.replace(/\s+/g, '').toLowerCase();
          if (seen.has(normalized)) return false;
          seen.add(normalized);
          return true;
        });

        // Sort by custom displayOrder first, then alphabetically
        list.sort((a: any, b: any) => {
          const orderA = a.displayOrder !== undefined && a.displayOrder !== null && a.displayOrder !== "" ? Number(a.displayOrder) : 9999;
          const orderB = b.displayOrder !== undefined && b.displayOrder !== null && b.displayOrder !== "" ? Number(b.displayOrder) : 9999;
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return a.name.localeCompare(b.name);
        });

        setManagedChocolates(list);
        try {
          localStorage.setItem('sabi_managed_chocolates', JSON.stringify(list));
        } catch (e) {}
      }
    });

    const unsubTrash = onSnapshot(collection(db, "trash_orders"), (snapshot) => {
      const trashList = snapshot.docs.map(doc => ({ fireId: doc.id, ...doc.data() }));
      trashList.sort((a: any, b: any) => (b.deletedAt || 0) - (a.deletedAt || 0));
      setTrashOrders(trashList);

      // Auto-cleanup items older than 30 days
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
      const cutoffTime = Date.now() - thirtyDaysInMs;
      trashList.forEach(async (item: any) => {
        if (item.deletedAt && item.deletedAt < cutoffTime) {
          try {
            await deleteDoc(doc(db, "trash_orders", item.fireId));
          } catch (e) {
            console.error("Failed to auto-cleanup old trash item:", e);
          }
        }
      });
    });

    const unsubActivityLogs = onSnapshot(
      query(collection(db, "activity_logs"), orderBy("timestamp", "desc")),
      (snapshot) => {
        setActivityLogs(snapshot.docs.map(d => ({ fireId: d.id, ...d.data() })));
      }
    );

    const unsubPasscodes = onSnapshot(doc(db, 'daily_tasks_board', 'passcodes'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.reports) setReportsPasscode(data.reports);
        if (data.history) setHistoryPasscode(data.history);
      } else {
        setDoc(doc(db, 'daily_tasks_board', 'passcodes'), {
          reports: '963',
          history: '852'
        }).catch(err => console.error("Failed to init Firestore passcodes:", err));
      }
    });

    const unsubIgnoredDups = onSnapshot(doc(db, 'app_settings', 'ignored_duplicates'), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (Array.isArray(data.phoneNumbers)) {
          setIgnoredDuplicatePhones(data.phoneNumbers);
        }
      }
    });

    const unsubOrderTypes = onSnapshot(collection(db, "order_types"), (snapshot) => {
      let list: any[] = snapshot.docs.map(doc => ({ fireId: doc.id, ...doc.data() }));
      if (list.length === 0) {
        const defaults = [
          { name: "Sabi", createdAt: new Date().toISOString() },
          { name: "Thaaru", createdAt: new Date().toISOString() },
          { name: "Choco Wrapz", createdAt: new Date().toISOString() }
        ];
        defaults.forEach(d => addDoc(collection(db, "order_types"), d).catch(() => {}));
        const initialList = defaults.map((d, i) => ({ fireId: `default-${i + 1}`, name: d.name }));
        setOrderTypes(initialList);
        try {
          localStorage.setItem('sabi_order_types', JSON.stringify(initialList));
        } catch (e) {}
      } else {
        list.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
        const normalizedList = list.map((item, idx) => ({
          fireId: item.fireId || `ot-${idx + 1}`,
          name: getOrderTypeName(item) || `Order Type ${idx + 1}`,
          ...item
        }));
        setOrderTypes(normalizedList);
        try {
          localStorage.setItem('sabi_order_types', JSON.stringify(normalizedList));
        } catch (e) {}
      }
    });

    return () => { unsubOrders(); unsubEmployees(); unsubInventory(); unsubProducts(); unsubManagedChocs(); unsubTrash(); unsubActivityLogs(); unsubPasscodes(); unsubIgnoredDups(); unsubOrderTypes(); };
  }, []);

  const [isProfitModalOpen, setIsProfitModalOpen] = useState(false);



  const [regData, setRegData] = useState({ name: "", username: "", password: "" });
  const [showApprovalPanel, setShowApprovalPanel] = useState(false);
  const [openActionId, setOpenActionId] = useState<number | null>(null);

  // Global listener: Close 3-dot action menu when clicking ANYWHERE outside
  useEffect(() => {
    if (openActionId === null) return;
    const handleGlobalClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.action-menu-popup') && !target.closest('.action-menu-trigger')) {
        setOpenActionId(null);
      }
    };
    document.addEventListener('mousedown', handleGlobalClickOutside);
    document.addEventListener('touchstart', handleGlobalClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleGlobalClickOutside);
      document.removeEventListener('touchstart', handleGlobalClickOutside);
    };
  }, [openActionId]);

  const [activeTab, setActiveTab] = useState<'dashboard1' | 'dashboard2' | 'products' | 'tracking' | 'reports' | 'inventories' | 'daily_tasks' | 'random_picker' | 'attendance'>(
    (localStorage.getItem('activeTab') as any) || 'dashboard1'
  );
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const debouncedProductSearch = useDebounce(productSearchQuery, 300);

  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [isWinnerPickerModalOpen, setIsWinnerPickerModalOpen] = useState(false);
  const [historyDetailOrder, setHistoryDetailOrder] = useState<any>(null);
  const [d1Wallpaper, setD1Wallpaper] = useState(() => localStorage.getItem('sabi_wallpaper_dashboard1') || "");
  const [d2Wallpaper, setD2Wallpaper] = useState(() => localStorage.getItem('sabi_wallpaper_dashboard2') || "");
  const [invWallpaper, setInvWallpaper] = useState(() => localStorage.getItem('sabi_wallpaper_inventories') || "");
  const [reportsWallpaper, setReportsWallpaper] = useState(() => localStorage.getItem('sabi_wallpaper_reports') || "");
  const [dailyTasksWallpaper, setDailyTasksWallpaper] = useState(() => localStorage.getItem('sabi_daily_tasks_wallpaper') || "");
  const [attendanceWallpaper, setAttendanceWallpaper] = useState(() => {
    const activeUser = profile?.username || localStorage.getItem('loggedInName') || "";
    return (activeUser && localStorage.getItem(`sabi_wallpaper_attendance_${activeUser}`)) || localStorage.getItem('sabi_wallpaper_attendance') || "";
  });
  const [trackWallpaper, setTrackWallpaper] = useState(() => localStorage.getItem('sabi_wallpaper_tracking') || "");

  // Sync loggedInName and attendance wallpaper when authenticated profile changes
  // Only use Supabase profile.username as fallback if no loggedInName was set by the employee login flow
  useEffect(() => {
    if (profile?.username) {
      const existingName = localStorage.getItem('loggedInName');
      if (!existingName) {
        setLoggedInName(profile.username);
        localStorage.setItem('loggedInName', profile.username);
      }
      const activeUser = existingName || profile.username;
      const userWp = localStorage.getItem(`sabi_wallpaper_attendance_${activeUser}`) || localStorage.getItem('sabi_wallpaper_attendance') || "";
      setAttendanceWallpaper(userWp);
    }
  }, [profile?.username]);
  const [showWallpaperDropdown, setShowWallpaperDropdown] = useState(false);
  const isWallpaperActive =
    (activeTab === 'dashboard1' && !!d1Wallpaper) ||
    (activeTab === 'dashboard2' && !!d2Wallpaper) ||
    (activeTab === 'inventories' && !!invWallpaper) ||
    (activeTab === 'reports' && !!reportsWallpaper) ||
    (activeTab === 'attendance' && !!attendanceWallpaper) ||
    (activeTab === 'daily_tasks' && !!dailyTasksWallpaper) ||
    (activeTab === 'tracking' && !!trackWallpaper);

  const [boardLists, setBoardLists] = useState<any[]>([]);
  const [readCardIds, setReadCardIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('sabi_read_card_ids');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('sabi_read_card_ids', JSON.stringify(readCardIds));
  }, [readCardIds]);

  useEffect(() => {
    const boardDocRef = doc(db, 'daily_tasks_board', 'board_data');
    const unsubscribe = onSnapshot(boardDocRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.lists) {
          setBoardLists(data.lists);
        }
      }
    }, (error) => {
      console.error('Firestore board listener error in Dashboard:', error);
    });
    return () => unsubscribe();
  }, []);

  const notifications = useMemo(() => {
    const printList = boardLists.find(l => l.title.trim().toLowerCase() === 'forward to print');
    if (!printList || !printList.cards) return [];

    return printList.cards.map((card: any) => ({
      id: card.id,
      cardTitle: card.title || card.phoneNumber,
      phoneNumber: card.phoneNumber,
      chocolateCount: card.chocolateCount || '',
      comments: card.comments || '',
      birthdayDate: card.birthdayDate || '',
      timestamp: card.timestamp || new Date().toISOString(),
      read: readCardIds.includes(card.id)
    })).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [boardLists, readCardIds]);

  const markAllNotificationsAsRead = () => {
    const cardIds = notifications.map(n => n.id);
    setReadCardIds(prev => Array.from(new Set([...prev, ...cardIds])));
    toast.success("All notifications marked as read");
  };

  const clearAllNotifications = async () => {
    try {
      const boardDocRef = doc(db, 'daily_tasks_board', 'board_data');
      const updatedLists = boardLists.map(l => ({ ...l, cards: [...l.cards] }));
      const printList = updatedLists.find(l => l.title.trim().toLowerCase() === 'forward to print');
      const completedList = updatedLists.find(l => l.title.trim().toLowerCase() === 'order completed');

      if (printList && printList.cards.length > 0) {
        const cardsToMove = printList.cards.map((c: any) => ({
          ...c,
          status: 'Order Completed'
        }));

        printList.cards = [];

        if (completedList) {
          completedList.cards.push(...cardsToMove);
        } else {
          updatedLists[0].cards.push(...cardsToMove);
        }

        await setDoc(boardDocRef, {
          lists: updatedLists,
          updatedAt: new Date().toISOString()
        }, { merge: true });

        toast.success("All notifications cleared (moved to Order Completed)");
      }
    } catch (err) {
      console.error('Failed to clear notifications:', err);
      toast.error('Failed to clear notifications');
    }
  };

  const handleNotificationClick = (notification: any) => {
    const matchedOrder = orders.find(o => o.phone === notification.phoneNumber || o.name === notification.cardTitle);

    if (matchedOrder) {
      setHistoryDetailOrder(matchedOrder);
    } else {
      const matchedTrash = trashOrders.find(o => o.phone === notification.phoneNumber || o.name === notification.cardTitle);
      if (matchedTrash) {
        setHistoryDetailOrder({ ...matchedTrash, isFromTrash: true });
      } else {
        setHistoryDetailOrder({
          name: notification.cardTitle || 'Unknown Customer',
          phone: notification.phoneNumber || 'N/A',
          chocolate: 'N/A',
          count: '0',
          orderStatus: 'N/A',
          paymentStatus: 'N/A',
          totalOrderPrice: 0,
          isFallback: true
        });
      }
    }

    setReadCardIds(prev => Array.from(new Set([...prev, notification.id])));
  };

  const PRESET_WALLPAPERS = [
    { name: "Cream Soft Gradient", value: "linear-gradient(to right, #fdfbf7, #f5e6d3)" },
    { name: "Sabi Warm Glow", value: "linear-gradient(135deg, #fdf8f5 0%, #faefe8 100%)" },
    { name: "Golden Chocolate Mesh", value: "radial-gradient(circle at 80% 20%, #fdf5e6 0%, #f7ebd3 100%)" },
    { name: "Pastel Lavender Mist", value: "linear-gradient(135deg, #fbf7ff 0%, #f3e6ff 100%)" },
    { name: "Minimal Soft Slate", value: "linear-gradient(to bottom, #f8fafc, #f1f5f9)" }
  ];

  const handleWallpaperUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'd1' | 'd2' | 'inventories' | 'tracking' | 'reports') => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading("Uploading background to Cloudinary...");
    try {
      const cdnUrl = await uploadToCloudinary(file);
      if (target === 'd1') {
        setD1Wallpaper(cdnUrl);
        localStorage.setItem('sabi_wallpaper_dashboard1', cdnUrl);
        toast.success("Dashboard 1 background updated!", { id: toastId });
      } else if (target === 'd2') {
        setD2Wallpaper(cdnUrl);
        localStorage.setItem('sabi_wallpaper_dashboard2', cdnUrl);
        toast.success("Dashboard 2 background updated!", { id: toastId });
      } else if (target === 'inventories') {
        setInvWallpaper(cdnUrl);
        localStorage.setItem('sabi_wallpaper_inventories', cdnUrl);
        toast.success("Inventories background updated!", { id: toastId });
      } else if (target === 'tracking') {
        setTrackWallpaper(cdnUrl);
        localStorage.setItem('sabi_wallpaper_tracking', cdnUrl);
        toast.success("Orders Tracking background updated!", { id: toastId });
      } else if (target === 'reports') {
        setReportsWallpaper(cdnUrl);
        localStorage.setItem('sabi_wallpaper_reports', cdnUrl);
        toast.success("Reports background updated!", { id: toastId });
      }
    } catch (err: any) {
      console.error("Cloudinary wallpaper upload error:", err);
      toast.error(err?.message || "Failed to upload wallpaper.", { id: toastId });
    }
  };

  const handleClearWallpaper = (target: 'd1' | 'd2' | 'inventories' | 'tracking' | 'reports') => {
    if (target === 'd1') {
      setD1Wallpaper("");
      localStorage.removeItem('sabi_wallpaper_dashboard1');
      toast.success("Dashboard 1 background cleared.");
    } else if (target === 'd2') {
      setD2Wallpaper("");
      localStorage.removeItem('sabi_wallpaper_dashboard2');
      toast.success("Dashboard 2 background cleared.");
    } else if (target === 'inventories') {
      setInvWallpaper("");
      localStorage.removeItem('sabi_wallpaper_inventories');
      toast.success("Inventories background cleared.");
    } else if (target === 'tracking') {
      setTrackWallpaper("");
      localStorage.removeItem('sabi_wallpaper_tracking');
      toast.success("Orders Tracking background cleared.");
    } else if (target === 'reports') {
      setReportsWallpaper("");
      localStorage.removeItem('sabi_wallpaper_reports');
      toast.success("Reports background cleared.");
    }
  };

  useEffect(() => {
    if (role !== 'Employee' || !isLoggedIn || !employeeId) return;

    const sendHeartbeat = async () => {
      try {
        await updateDoc(doc(db, "employees", employeeId), {
          isLive: true,
          lastActive: new Date().toISOString()
        });
      } catch (err) {
        console.error("Error sending heartbeat:", err);
      }
    };

    sendHeartbeat();
    const intervalId = setInterval(sendHeartbeat, 30000);

    return () => {
      clearInterval(intervalId);
      updateDoc(doc(db, "employees", employeeId), {
        isLive: false
      }).catch(err => console.error("Error setting offline on logout:", err));
    };
  }, [role, isLoggedIn, employeeId]);

  useEffect(() => {
    if (role !== 'Employee' || !isLoggedIn || !employeeId) return;

    const unsubSelf = onSnapshot(doc(db, "employees", employeeId), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.status === 'Declined') {
          alert("Your access has been revoked by the administrator.");
          handleLogout();
        }
      } else {
        alert("Your account no longer exists.");
        handleLogout();
      }
    });

    return () => unsubSelf();
  }, [role, isLoggedIn, employeeId]);

  const [showSidebarHighlight, setShowSidebarHighlight] = useState(true);

  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      const sidebar = document.querySelector('aside');
      const toggleBtn = document.querySelector('[title="Toggle Menu"]');
      if (
        sidebar &&
        !sidebar.contains(e.target as Node) &&
        (!toggleBtn || !toggleBtn.contains(e.target as Node))
      ) {
        setShowSidebarHighlight(false);
      }

      // Close notification dropdown when clicking outside
      const target = e.target as HTMLElement;
      const isNotificationClick = target.closest('.notification-container-ref') || target.closest('[title="Notifications"]');
      if (!isNotificationClick) {
        setShowNotificationDropdown(false);
      }

      // Close Money and Delivery dropdowns when clicking outside
      const isMoneyDropdown = target.closest('.d1-money-dropdown-container');
      if (!isMoneyDropdown) {
        setD1MoneyDropdownOpen(false);
      }
      const isDeliveryDropdown = target.closest('.d1-delivery-dropdown-container');
      if (!isDeliveryDropdown) {
        setD1DeliveryDropdownOpen(false);
      }
    };
    document.addEventListener('click', handleDocumentClick);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, []);

  const [isSidebarOpen, setIsSidebarOpen] = useState(() => (typeof window !== "undefined" ? window.innerWidth >= 1024 : true));
  const [isSavingOrder, setIsSavingOrder] = useState(false);

  // --- INDEPENDENT FILTER STATES PER TAB ---
  // Dashboard 1 filters
  const [d1PaymentFilter, setD1PaymentFilter] = useState<'All' | 'Full Paid' | 'Partially Paid' | 'Pending'>('All');
  const [d1DeliveryFilter, setD1DeliveryFilter] = useState<'All' | 'Delivered' | 'In Process'>('All');
  const [d1MoneyDropdownOpen, setD1MoneyDropdownOpen] = useState(false);
  const [d1DeliveryDropdownOpen, setD1DeliveryDropdownOpen] = useState(false);
  const [d1OrderStatusFilter, setD1OrderStatusFilter] = useState<string>('All');
  const [d1TableTypeFilter, setD1TableTypeFilter] = useState<string>('All');
  const [d1DuplicateFilter, setD1DuplicateFilter] = useState<'All' | 'Duplicates Only' | 'Non-Duplicates'>('All');
  const [d1RevenueDateType, setD1RevenueDateType] = useState<string>('Dispatch Date');
  const [d1RevenueMonthKey, setD1RevenueMonthKey] = useState<string>("");
  const [d1DateFilter, setD1DateFilter] = useState({ from: "", to: "" });
  const [d1CountFilter, setD1CountFilter] = useState<string>('All');
  const [d1DashboardSearch, setD1DashboardSearch] = useState("");
  const [d1FunctionDates, setD1FunctionDates] = useState<string[]>([]);
  const [d1DeliveryDates, setD1DeliveryDates] = useState<string[]>([]);
  const [d1ChocFilter, setD1ChocFilter] = useState<string>('');
  const [d1LocationFilter, setD1LocationFilter] = useState<string>('All');
  const [d1RoleFilter, setD1RoleFilter] = useState<string>('All');

  // Dashboard 2 filters
  const [d2PaymentFilter, setD2PaymentFilter] = useState<'All' | 'Full Paid' | 'Partially Paid' | 'Pending'>('All');
  const [d2DeliveryFilter, setD2DeliveryFilter] = useState<'All' | 'Delivered' | 'In Process'>('All');
  const [d2OrderStatusFilter, setD2OrderStatusFilter] = useState<string>('All');
  const [d2TableTypeFilter, setD2TableTypeFilter] = useState<string>('All');
  const [d2DuplicateFilter, setD2DuplicateFilter] = useState<'All' | 'Duplicates Only' | 'Non-Duplicates'>('All');
  const [d2RevenueDateType, setD2RevenueDateType] = useState<string>('Dispatch Date');
  const [d2RevenueMonthKey, setD2RevenueMonthKey] = useState<string>("");
  const [d2DateFilter, setD2DateFilter] = useState({ from: "", to: "" });
  const [d2CountFilter, setD2CountFilter] = useState<string>('All');
  const [d2DashboardSearch, setD2DashboardSearch] = useState("");
  const [d2FunctionDates, setD2FunctionDates] = useState<string[]>([]);
  const [d2DeliveryDates, setD2DeliveryDates] = useState<string[]>([]);
  const [d2ChocFilter, setD2ChocFilter] = useState<string>('');
  const [d2LocationFilter, setD2LocationFilter] = useState<string>('All');
  const [d2RoleFilter, setD2RoleFilter] = useState<string>('All');

  // Ignored duplicate contact numbers synced via Firestore database
  const [ignoredDuplicatePhones, setIgnoredDuplicatePhones] = useState<string[]>([]);

  const updateIgnoredDuplicatesInDB = async (newList: string[]) => {
    try {
      await setDoc(doc(db, 'app_settings', 'ignored_duplicates'), {
        phoneNumbers: newList,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.error("Failed to sync ignored duplicate phone numbers to database:", err);
      toast.error("Failed to update database");
    }
  };

  // Compute duplicate contact numbers map for Dashboard 1 (chocolates)
  const duplicatePhoneCounts = useMemo(() => {
    const phoneMap: Record<string, { count: number; orders: any[] }> = {};
    const d1Orders = orders.filter(o => o.category !== 'product');

    for (const order of d1Orders) {
      const rawPhone = order.phone;
      const phoneKey = normalizePhone(rawPhone);
      if (!phoneKey || phoneKey.length < 5 || phoneKey === "0000000000") continue;

      if (!phoneMap[phoneKey]) {
        phoneMap[phoneKey] = { count: 0, orders: [] };
      }
      phoneMap[phoneKey].count += 1;
      phoneMap[phoneKey].orders.push(order);
    }

    return phoneMap;
  }, [orders]);

  // Active duplicate phone numbers (excluding ignored ones)
  const activeDuplicatePhonesMap = useMemo(() => {
    const duplicates: Record<string, { count: number; orders: any[]; rawPhone: string }> = {};

    Object.entries(duplicatePhoneCounts).forEach(([phoneKey, data]) => {
      if (data.count > 1 && !ignoredDuplicatePhones.includes(phoneKey)) {
        duplicates[phoneKey] = {
          count: data.count,
          orders: data.orders,
          rawPhone: data.orders[0]?.phone || phoneKey
        };
      }
    });

    return duplicates;
  }, [duplicatePhoneCounts, ignoredDuplicatePhones]);

  const handleIgnoreDuplicatePhone = (phoneKey: string) => {
    if (!ignoredDuplicatePhones.includes(phoneKey)) {
      const newList = [...ignoredDuplicatePhones, phoneKey];
      setIgnoredDuplicatePhones(newList);
      updateIgnoredDuplicatesInDB(newList);
      toast.success(`Ignored duplicate contact number (${formatPhoneNumber(phoneKey)})`);
    }
  };

  const handleToggleIgnoreDuplicatePhone = (phoneKey: string) => {
    let newList: string[];
    if (ignoredDuplicatePhones.includes(phoneKey)) {
      newList = ignoredDuplicatePhones.filter(p => p !== phoneKey);
      toast.info(`Restored duplicate warning for ${formatPhoneNumber(phoneKey)}`);
    } else {
      newList = [...ignoredDuplicatePhones, phoneKey];
      toast.success(`Ignored duplicate contact number (${formatPhoneNumber(phoneKey)})`);
    }
    setIgnoredDuplicatePhones(newList);
    updateIgnoredDuplicatesInDB(newList);
  };

  const handleIgnoreAllDuplicates = () => {
    const activeKeys = Object.keys(activeDuplicatePhonesMap);
    if (activeKeys.length === 0) return;
    const newList = Array.from(new Set([...ignoredDuplicatePhones, ...activeKeys]));
    setIgnoredDuplicatePhones(newList);
    updateIgnoredDuplicatesInDB(newList);
    toast.success(`Ignored ${activeKeys.length} duplicate contact number(s)`);
  };

  const handleResetIgnoredDuplicates = () => {
    setIgnoredDuplicatePhones([]);
    updateIgnoredDuplicatesInDB([]);
    toast.info("Reset all ignored duplicate contact numbers");
  };

  // Tracking filters
  const [trkSearch, setTrkSearch] = useState("");
  const debouncedTrkSearch = useDebounce(trkSearch, 300);
  const [trkPaymentFilter, setTrkPaymentFilter] = useState<'All' | 'Full Paid' | 'Partially Paid' | 'Pending'>('All');
  const [trkDeliveryFilter, setTrkDeliveryFilter] = useState<'All' | 'Delivered' | 'In Process'>('All');
  const [trkOrderStatusFilter, setTrkOrderStatusFilter] = useState<string>('All');

  // Reports filters
  const [reportOrderTypeFilter, setReportOrderTypeFilter] = useState<string>("All");

  // Computed active filters based on current tab
  const paymentFilter = activeTab === 'dashboard2' ? d2PaymentFilter : d1PaymentFilter;
  const setPaymentFilter = activeTab === 'dashboard2' ? setD2PaymentFilter : setD1PaymentFilter;
  const deliveryFilter = activeTab === 'dashboard2' ? d2DeliveryFilter : d1DeliveryFilter;
  const setDeliveryFilter = activeTab === 'dashboard2' ? setD2DeliveryFilter : setD1DeliveryFilter;
  const orderStatusFilter = activeTab === 'dashboard2' ? d2OrderStatusFilter : d1OrderStatusFilter;
  const setOrderStatusFilter = activeTab === 'dashboard2' ? setD2OrderStatusFilter : setD1OrderStatusFilter;
  const tableTypeFilter = activeTab === 'dashboard2' ? d2TableTypeFilter : d1TableTypeFilter;
  const setTableTypeFilter = activeTab === 'dashboard2' ? setD2TableTypeFilter : setD1TableTypeFilter;
  const duplicateFilter = activeTab === 'dashboard2' ? d2DuplicateFilter : d1DuplicateFilter;
  const setDuplicateFilter = activeTab === 'dashboard2' ? setD2DuplicateFilter : setD1DuplicateFilter;
  const revenueDateType = activeTab === 'dashboard2' ? d2RevenueDateType : d1RevenueDateType;
  const setRevenueDateType = activeTab === 'dashboard2' ? setD2RevenueDateType : setD1RevenueDateType;
  const revenueMonthKey = activeTab === 'dashboard2' ? d2RevenueMonthKey : d1RevenueMonthKey;
  const setRevenueMonthKey = activeTab === 'dashboard2' ? setD2RevenueMonthKey : setD1RevenueMonthKey;
  const dateFilter = activeTab === 'dashboard2' ? d2DateFilter : d1DateFilter;
  const setDateFilter = activeTab === 'dashboard2' ? setD2DateFilter : setD1DateFilter;

  const handleRevenueMonthChange = (monthKey: string) => {
    if (!monthKey) {
      setRevenueMonthKey("");
      setDateFilter({ from: "", to: "" });
      return;
    }
    setRevenueMonthKey(monthKey);
    const [yearStr, monthStr] = monthKey.split('-');
    const y = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10);
    const startDate = new Date(y, m - 1, 1);
    const endDate = new Date(y, m, 0);
    const fromStr = format(startDate, "yyyy-MM-dd");
    const toStr = format(endDate, "yyyy-MM-dd");
    setDateFilter({ from: fromStr, to: toStr });
  };
  const countFilter = activeTab === 'dashboard2' ? d2CountFilter : d1CountFilter;
  const setCountFilter = activeTab === 'dashboard2' ? setD2CountFilter : setD1CountFilter;
  const dashboardSearch = activeTab === 'dashboard2' ? d2DashboardSearch : d1DashboardSearch;
  const setDashboardSearch = activeTab === 'dashboard2' ? setD2DashboardSearch : setD1DashboardSearch;
  const debouncedDashboardSearch = useDebounce(dashboardSearch, 300);
  const functionDates = activeTab === 'dashboard2' ? d2FunctionDates : d1FunctionDates;
  const setFunctionDates = activeTab === 'dashboard2' ? setD2FunctionDates : setD1FunctionDates;
  const deliveryDates = activeTab === 'dashboard2' ? d2DeliveryDates : d1DeliveryDates;
  const setDeliveryDates = activeTab === 'dashboard2' ? setD2DeliveryDates : setD1DeliveryDates;
  const chocFilter = activeTab === 'dashboard2'
    ? d2ChocFilter
    : (d1SelectedChocolateBoxFilter !== 'All Chocolates' && d1SelectedChocolateBoxFilter ? d1SelectedChocolateBoxFilter : d1ChocFilter);
  const setChocFilter = (val: string) => {
    if (activeTab === 'dashboard2') {
      setD2ChocFilter(val);
    } else {
      setD1ChocFilter(val);
      setD1SelectedChocolateBoxFilter(val && val !== 'All Chocolates' ? val : 'All Chocolates');
    }
  };
  const locationFilter = activeTab === 'dashboard2' ? d2LocationFilter : d1LocationFilter;
  const setLocationFilter = activeTab === 'dashboard2' ? setD2LocationFilter : setD1LocationFilter;
  const roleFilter = activeTab === 'dashboard2' ? d2RoleFilter : d1RoleFilter;
  const setRoleFilter = activeTab === 'dashboard2' ? setD2RoleFilter : setD1RoleFilter;

  const isAnyFilterActive = useMemo(() => {
    return (
      paymentFilter !== 'All' ||
      deliveryFilter !== 'All' ||
      orderStatusFilter !== 'All' ||
      tableTypeFilter !== 'All' ||
      duplicateFilter !== 'All' ||
      Boolean(dateFilter.from || dateFilter.to) ||
      countFilter !== 'All' ||
      chocFilter !== '' ||
      (activeTab !== 'dashboard2' && d1SelectedChocolateBoxFilter !== 'All Chocolates') ||
      locationFilter !== 'All' ||
      roleFilter !== 'All' ||
      deliveryDates.length > 0 ||
      functionDates.length > 0 ||
      Boolean(dashboardSearch)
    );
  }, [
    paymentFilter,
    deliveryFilter,
    orderStatusFilter,
    tableTypeFilter,
    duplicateFilter,
    dateFilter,
    countFilter,
    chocFilter,
    d1SelectedChocolateBoxFilter,
    locationFilter,
    roleFilter,
    deliveryDates,
    functionDates,
    dashboardSearch,
    activeTab,
  ]);

  const handleClearAllFilters = () => {
    setD1PaymentFilter('All');
    setD2PaymentFilter('All');
    setD1DeliveryFilter('All');
    setD2DeliveryFilter('All');
    setD1OrderStatusFilter('All');
    setD2OrderStatusFilter('All');
    setD1TableTypeFilter('All');
    setD2TableTypeFilter('All');
    setD1DuplicateFilter('All');
    setD2DuplicateFilter('All');
    setD1DateFilter({ from: '', to: '' });
    setD2DateFilter({ from: '', to: '' });
    setD1CountFilter('All');
    setD2CountFilter('All');
    setD1ChocFilter('');
    setD2ChocFilter('');
    setD1SelectedChocolateBoxFilter('All Chocolates');
    setD1LocationFilter('All');
    setD2LocationFilter('All');
    setD1RoleFilter('All');
    setD2RoleFilter('All');
    setD1DeliveryDates([]);
    setD2DeliveryDates([]);
    setD1FunctionDates([]);
    setD2FunctionDates([]);
    setD1DashboardSearch('');
    setD2DashboardSearch('');
    toast.success('All active filters reset to default');
  };

  const selectedMonthItems = useMemo(() => {
    const curTableTypeFilter = activeTab === 'dashboard2' ? d2TableTypeFilter : d1TableTypeFilter;
    const curRoleFilter = activeTab === 'dashboard2' ? d2RoleFilter : d1RoleFilter;

    return orders.reduce((sum, order) => {
      if (order.status === "Cancelled") return sum;

      const isProduct = order.category === 'product';
      const categoryMatch = activeTab === 'dashboard2' ? isProduct : !isProduct;
      if (!categoryMatch) return sum;

      const typeMatch = curTableTypeFilter === 'All' || (order.orderType || "Thaaru") === curTableTypeFilter;
      if (!typeMatch) return sum;

      const roleMatch = curRoleFilter === 'All' || order.role === curRoleFilter;
      if (!roleMatch) return sum;

      const targetDateStr = parseDateToYYYYMMDD(order.deliveryDate || order.functionDate || order.orderDate);
      if (!targetDateStr) return sum;
      if (targetDateStr.startsWith(targetMonthKey)) {
        const counts = String(order.count || 0).split(',').map(c => Number(c.trim()) || 0);
        return sum + counts.reduce((s, val) => s + val, 0);
      }
      return sum;
    }, 0);
  }, [orders, targetMonthKey, activeTab, d1TableTypeFilter, d2TableTypeFilter, d1RoleFilter, d2RoleFilter]);

  const targetPercentage = monthlyTarget > 0 ? Math.min(100, Math.round((selectedMonthItems / monthlyTarget) * 100)) : 0;
  const currentMonthKey = format(new Date(), "yyyy-MM");
  const isMonthPast = targetMonthKey < currentMonthKey;
  const isMonthCurrent = targetMonthKey === currentMonthKey;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const isMonthEnd = isMonthPast || (isMonthCurrent && now.getDate() >= daysInMonth);
  const isTargetCompleted = selectedMonthItems >= monthlyTarget && monthlyTarget > 0;
  const isTargetFailed = isMonthEnd && selectedMonthItems < monthlyTarget;

  // Wrapper helpers for cost analytics states depending on Reports vs Inventories settings
  const isInvAdmin = (activeTab as any) === 'inventories_admin_panel';
  const currentAdminDateType = isInvAdmin ? invAdminDateType : adminDateType;
  const currentAdminDateRange = isInvAdmin ? invAdminDateRange : adminDateRange;
  const currentAdminReportDash = isInvAdmin ? invAdminReportDash : adminReportDash;
  const currentAdminReportMenuOpen = isInvAdmin ? invAdminReportMenuOpen : adminReportMenuOpen;

  const handleSetAdminDateType = (val: string) => {
    if (isInvAdmin) setInvAdminDateType(val);
    else setAdminDateType(val);
  };
  const handleSetAdminDateRange = (val: { from: string; to: string }) => {
    if (isInvAdmin) setInvAdminDateRange(val);
    else setAdminDateRange(val);
  };
  const handleSetAdminReportDash = (val: 'None' | 'Dashboard 1' | 'Dashboard 2' | 'All') => {
    if (isInvAdmin) setInvAdminReportDash(val);
    else setAdminReportDash(val);
  };
  const handleSetAdminReportMenuOpen = (val: boolean) => {
    if (isInvAdmin) setInvAdminReportMenuOpen(val);
    else setAdminReportMenuOpen(val);
  };

  const [reportDateRange, setReportDateRange] = useState({ start: "", end: "" });
  const [reportDashboardFilter, setReportDashboardFilter] = useState("All");
  const [reportFromMonth, setReportFromMonth] = useState("");
  const [reportToMonth, setReportToMonth] = useState("");

  // Sequential serial number map: oldest order = SR001, next = SR002, etc.
  const orderSerialMap = useMemo(() => {
    const sorted = [...orders].sort((a, b) => a.id - b.id);
    const map: Record<number, number> = {};
    sorted.forEach((order, index) => { map[order.id] = index + 1; });
    return map;
  }, [orders]);
  const getSerial = (id: number) => `SR${String(orderSerialMap[id] || id).padStart(3, '0')}`;
  const managedChocPricesMap = useMemo(() => {
    const map: Record<string, { retail: number; wholesale: number }> = {};
    managedChocolates.forEach(c => map[c.name.toLowerCase()] = { retail: Number(c.retailPrice || c.price || 0), wholesale: Number(c.wholesalePrice || c.price || 0) });
    return map;
  }, [managedChocolates]);

  const managedChocCostsMap = useMemo(() => {
    const map: Record<string, number> = {};
    managedChocolates.forEach(c => {
      map[c.name.toLowerCase()] = Number(c.stickerPrice !== undefined ? c.stickerPrice : (c.costPrice !== undefined ? c.costPrice : 0));
    });
    return map;
  }, [managedChocolates]);

  const managedChocStickersMap = useMemo(() => {
    const map: Record<string, number> = {};
    managedChocolates.forEach(c => map[c.name.toLowerCase()] = Number(c.stickerPrice !== undefined ? c.stickerPrice : (c.costPrice !== undefined ? c.costPrice : 1.5)));
    return map;
  }, [managedChocolates]);

  const dynamicInventory = useMemo(() => {
    return managedChocolates.map(c => c.name);
  }, [managedChocolates]);

  const uniqueChocolates = useMemo(() => {
    const allChocs = new Set<string>(dynamicInventory);
    orders.forEach(o => {
      if (o.chocolate) { String(o.chocolate).split(',').forEach(c => allChocs.add(c.trim())); }
    });
    return Array.from(allChocs).filter(Boolean);
  }, [orders, dynamicInventory]);

  const customPricesMap = useMemo(() => {
    const map: Record<string, number> = {};
    customProducts.forEach(p => {
      if (p.name) {
        const val = Number(p.price !== undefined && p.price !== null ? p.price : p.sellingPrice) || 0;
        map[p.name.toLowerCase().trim()] = val;
      }
    });
    return map;
  }, [customProducts]);

  const orderedProducts = useMemo(() => {
    return [...customProducts].sort((a: any, b: any) => {
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tA - tB;
    });
  }, [customProducts]);

  const singleProductsCount = useMemo(() => {
    return orderedProducts.filter(p => (p.productType || "Single product") === "Single product").length;
  }, [orderedProducts]);

  const comboSetsCount = useMemo(() => {
    return orderedProducts.filter(p => p.productType === "Combo set").length;
  }, [orderedProducts]);

  const filteredProducts = useMemo(() => {
    return orderedProducts.filter(p => {
      const pType = p.productType || "Single product";
      if (productTypeFilter !== 'all' && pType !== productTypeFilter) {
        return false;
      }
      if (debouncedProductSearch.trim() && (!p.name || !p.name.toLowerCase().includes(debouncedProductSearch.toLowerCase()))) {
        return false;
      }
      return true;
    });
  }, [orderedProducts, productTypeFilter, debouncedProductSearch]);

  const monthWiseReportData = useMemo(() => {
    const monthsMap: Record<string, { monthKey: string; monthName: string; totalRevenue: number; totalCost: number; netProfit: number }> = {};

    orders.forEach(order => {
      if (order.status === 'Cancelled') return;
      const targetDateStr = parseDateToYYYYMMDD(order.deliveryDate || order.functionDate || order.orderDate);
      if (!targetDateStr) return;

      const dateObj = new Date(targetDateStr);
      if (isNaN(dateObj.getTime())) return;

      const mKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`;
      const mName = dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

      if (!monthsMap[mKey]) {
        monthsMap[mKey] = { monthKey: mKey, monthName: mName, totalRevenue: 0, totalCost: 0, netProfit: 0 };
      }

      const priceInfo = calculatePriceInfo(order.chocolate, order.count, order.discount, order.isDeliveryFree || order.isChennai, order.paymentStatus, order.category, customPricesMap, order.manualDeliveryFee, order.orderStatus, managedChocPricesMap, order.pricingType, order.manualProductPrice);
      const costInfo = calculateOrderFinalCost(order, managedChocPricesMap, managedChocStickersMap, customPricesMap);

      monthsMap[mKey].totalRevenue += priceInfo.fullRevenue;
      monthsMap[mKey].totalCost += costInfo.finalCost;
      monthsMap[mKey].netProfit = monthsMap[mKey].totalRevenue - monthsMap[mKey].totalCost;
    });

    let sorted = Object.values(monthsMap).sort((a, b) => a.monthKey.localeCompare(b.monthKey));

    if (reportFromMonth) {
      sorted = sorted.filter(m => m.monthKey >= reportFromMonth);
    }
    if (reportToMonth) {
      sorted = sorted.filter(m => m.monthKey <= reportToMonth);
    }

    return sorted;
  }, [orders, customPricesMap, managedChocPricesMap, managedChocStickersMap, reportFromMonth, reportToMonth]);

  const [isAdminAuthModalOpen, setIsAdminAuthModalOpen] = useState(false);
  const [adminCreds, setAdminCreds] = useState({ username: "", password: "" });
  const [authError, setAuthError] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [isReportsAuthModalOpen, setIsReportsAuthModalOpen] = useState(false);
  const [reportsPassword, setReportsPassword] = useState("");
  const [reportsAuthError, setReportsAuthError] = useState("");

  const [reportsPasscode, setReportsPasscode] = useState('963');
  const [historyPasscode, setHistoryPasscode] = useState('852');
  const [isHistoryAuthModalOpen, setIsHistoryAuthModalOpen] = useState(false);
  const [historyPassword, setHistoryPassword] = useState("");
  const [historyAuthError, setHistoryAuthError] = useState("");
  const [isPasscodeSettingsOpen, setIsPasscodeSettingsOpen] = useState(false);
  const [tempReportsPasscode, setTempReportsPasscode] = useState('963');
  const [tempHistoryPasscode, setTempHistoryPasscode] = useState('852');

  const [isInvModalOpen, setIsInvModalOpen] = useState(false);
  const [invForm, setInvForm] = useState({
    date: new Date().toISOString().split('T')[0],
    chocolate: "",
    boxCount: "",
    itemsPerBox: ""
  });
  const [editInvId, setEditInvId] = useState<string | null>(null);
  const [viewingInvLog, setViewingInvLog] = useState<any>(null);

  const [salesTrackerChoc, setSalesTrackerChoc] = useState("All");
  const [salesTrackerFrom, setSalesTrackerFrom] = useState("");
  const [salesTrackerTo, setSalesTrackerTo] = useState("");

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminCreds.password === "4567") {
      setIsAuthenticated(true);
      setIsAdminAuthModalOpen(false);
      setAuthError("");
      setAdminCreds({ username: "", password: "" });
      setActiveTab('admin_panel' as any);
    } else if (adminCreds.password === "8520") {
      setIsAdminAuthModalOpen(false);
      setAuthError("");
      setAdminCreds({ username: "", password: "" });
      setIsAnalyticsModalOpen(true);
    } else {
      setAuthError("Invalid Password!");
    }
  };

  const handleReportsAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reportsPassword === reportsPasscode || reportsPassword === "561997" || reportsPassword === "8520") {
      setActiveTab('reports');
      setShowSidebarHighlight(true);
      setIsReportsAuthModalOpen(false);
      setReportsPassword("");
      setReportsAuthError("");
    } else {
      setReportsAuthError("Wrong Password! Access Denied.");
    }
  };

  const handleHistoryAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (historyPassword === historyPasscode || historyPassword === "8520") {
      setIsHistoryOpen(true);
      setIsHistoryAuthModalOpen(false);
      setHistoryPassword("");
      setHistoryAuthError("");
    } else {
      setHistoryAuthError("Wrong Password! Access Denied.");
    }
  };


  const [selectedOrders, setSelectedOrders] = useState<number[]>([]);
  const [showCheckboxes, setShowCheckboxes] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTrashOpen, setIsTrashOpen] = useState(false);
  const [trashOrders, setTrashOrders] = useState<any[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [historyTab, setHistoryTab] = useState<'users' | 'activity'>('users');
  const [historyModuleFilter, setHistoryModuleFilter] = useState('All');
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isExportPreviewOpen, setIsExportPreviewOpen] = useState(false);
  const [isReportPreviewOpen, setIsReportPreviewOpen] = useState(false);
  const [isShippingOpen, setIsShippingOpen] = useState(false);
  const [shippingOrder, setShippingOrder] = useState<any>(null);

  const [formData, setFormData] = useState({ id: null as any, fireId: null as any, name: "", phone: "", orderDate: "", functionDate: "", deliveryDate: "", chocolate: "", count: "", address: "", status: "In Process", paymentStatus: "Pending", discount: 0, isDeliveryFree: false, isChennai: false, orderType: "Sabi", role: "Others", orderStatus: "image edited (not paid)", category: "chocolate", manualDeliveryFee: "", advanceAmount: "", manualProductPrice: "", pricingType: 'retail' as 'retail' | 'wholesale' });

  const [orderTypeOthersToggle, setOrderTypeOthersToggle] = useState(true);

  // Header Visibility State (tab-specific)
  const [showHeaderMap, setShowHeaderMap] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('showHeaderMap');
      if (saved) {
        return JSON.parse(saved);
      }
      const oldSaved = localStorage.getItem('showHeader');
      if (oldSaved !== null) {
        const oldVal = oldSaved === 'true';
        return {
          dashboard1: oldVal,
          dashboard2: oldVal,
          daily_tasks: oldVal,
          inventories: oldVal,
          tracking: oldVal,
          reports: oldVal,
          random_picker: oldVal,
        };
      }
    } catch (e) {
      console.error(e);
    }
    return {
      dashboard1: false,
      dashboard2: false,
      daily_tasks: false,
      inventories: false,
      tracking: false,
      reports: false,
      random_picker: false,
    };
  });

  useEffect(() => {
    localStorage.setItem('showHeaderMap', JSON.stringify(showHeaderMap));
  }, [showHeaderMap]);

  const showHeader = showHeaderMap[activeTab] ?? false;

  const setShowHeader = (val: boolean | ((prev: boolean) => boolean)) => {
    setShowHeaderMap(prev => {
      const currentVal = prev[activeTab] ?? false;
      const nextVal = typeof val === 'function' ? val(currentVal) : val;
      return {
        ...prev,
        [activeTab]: nextVal
      };
    });
  };

  // Local Undo and Redo Stacks
  const undoStackRef = useRef<{
    type: string;
    undo: () => Promise<void>;
    redo: () => Promise<void>;
  }[]>([]);

  const redoStackRef = useRef<{
    type: string;
    undo: () => Promise<void>;
    redo: () => Promise<void>;
  }[]>([]);

  useEffect(() => {
    if (isModalOpen) {
      if (formData.role === 'Self') {
        setOrderTypeOthersToggle(false);
      } else {
        setOrderTypeOthersToggle(true);
      }
    }
  }, [isModalOpen, formData.role]);

  const [previewData, setPreviewData] = useState<any>(null);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [whatsAppMessage, setWhatsAppMessage] = useState("");
  const [whatsAppOrder, setWhatsAppOrder] = useState<any>(null);

  const uniqueCounts = useMemo(() => Array.from(new Set(orders.map(o => Number(o.count)))).sort((a, b) => a - b), [orders]);


  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);

  const [hiddenColsD1, setHiddenColsD1] = useState<Record<string, boolean>>({
    serialNo: true,
    role: true,
    orderDate: true,
    deliveryCharge: true,
    discount: true
  });
  const [hiddenColsD2, setHiddenColsD2] = useState<Record<string, boolean>>({
    serialNo: true,
    role: true,
    orderDate: true,
    deliveryCharge: true,
    discount: true
  });

  const hiddenCols = activeTab === 'dashboard2' ? hiddenColsD2 : hiddenColsD1;
  const setHiddenCols = activeTab === 'dashboard2' ? setHiddenColsD2 : setHiddenColsD1;

  const [isScreenshotMode, setIsScreenshotMode] = useState(false);
  const [screenshotChunkOrders, setScreenshotChunkOrders] = useState<any[]>([]);
  const [screenshotPageInfo, setScreenshotPageInfo] = useState({ page: 1, totalPages: 1, startNum: 1, endNum: 1, totalOrders: 0 });
  const [isDashMoreMenuOpen, setIsDashMoreMenuOpen] = useState(false);
  const screenshotTableRef = useRef<HTMLDivElement>(null);


  const toggleCol = (col: string) => {
    setHiddenCols(prev => ({ ...prev, [col]: !prev[col] }));
  };


  const uniqueNames = useMemo(() => Array.from(new Set(orders.map(o => o.name))), [orders]);
  const uniquePhones = useMemo(() => Array.from(new Set(orders.map(o => o.phone))), [orders]);

  const relatedLogs = useMemo(() => {
    if (!historyDetailOrder) return [];
    const nameQuery = historyDetailOrder.name.toLowerCase().trim();
    const phoneQuery = historyDetailOrder.phone ? historyDetailOrder.phone.trim() : '';

    return activityLogs.filter(log => {
      const actionLower = (log.action || '').toLowerCase();
      const nameMatch = nameQuery && actionLower.includes(nameQuery);
      const phoneMatch = phoneQuery && actionLower.includes(phoneQuery);
      return nameMatch || phoneMatch;
    });
  }, [historyDetailOrder, activityLogs]);



  const inventoryBalances = useMemo(() => {
    const balances: Record<string, number> = {};
    dynamicInventory.forEach(c => balances[c] = 0);

    inventoryLogs.forEach(log => {
      const key = normalizeChocName(String(log.chocolate), dynamicInventory);
      if (balances[key] !== undefined) {
        const qty = Number(log.boxCount || 0) * Number(log.itemsPerBox || 0);
        balances[key] += qty;
      }
    });


    orders.forEach(order => {
      if (order.orderStatus === 'cancelled') return;
      // Exclude 'Self' orders from inventory calculations (only 'Others' affect inventory)
      const isSelf = order.role === 'Self';
      if (isSelf) return;
      if (!order.chocolate) return;

      const orderChocs = String(order.chocolate).split(',');
      const orderCountStr = String(order.count || 0);
      const countParts = orderCountStr.split(',').map(c => Number(c.trim()) || 0);

      orderChocs.forEach((c, idx) => {
        const key = normalizeChocName(c, dynamicInventory);
        const qty = countParts[idx] !== undefined ? countParts[idx] : (countParts[0] || 0);
        if (balances[key] !== undefined) {
          balances[key] -= qty;
        }
      });
    });

    return balances;
  }, [inventoryLogs, orders, dynamicInventory]);

  const currentInventoryValueData = useMemo(() => {
    const CURRENT_INVENTORY_RETAIL_PRICES: Record<string, number> = {
      "1 rs chocolate": 8,
      "1rs chocolate": 8,
      "10 rs 5 star": 22,
      "10rs 5 star": 22,
      "10 rs dairy milk": 20,
      "10rs dairy milk": 20,
      "10 rs kitkat": 20,
      "10rs kitkat": 20,
      "2 rs dairy milk shots": 10,
      "2rs dairy milk shots": 10,
      "2 rs dairymilk shots": 10,
      "2rs dairymilk shots": 10,
      "5 rs 5 star": 15,
      "5rs 5 star": 15,
      "5 rs dairy milk": 15,
      "5rs dairy milk": 15,
      "5 rs milky bar": 17,
      "5rs milky bar": 17,
      "5 rs peanut candy": 17,
      "5rs peanut candy": 17,
      "5 rs dark fantasy": 17,
      "5rs dark fantasy": 17
    };

    const getRetailPrice = (chocName: string) => {
      const normalized = chocName.toLowerCase().trim().replace(/\s+/g, ' ');
      const dbPriceObj = managedChocPricesMap[normalized] || CHOCOLATE_PRICES_MAP[normalized];
      if (dbPriceObj && dbPriceObj.retail !== undefined) {
        return dbPriceObj.retail;
      }
      if (CURRENT_INVENTORY_RETAIL_PRICES[normalized] !== undefined) {
        return CURRENT_INVENTORY_RETAIL_PRICES[normalized];
      }
      return dbPriceObj ? (dbPriceObj.retail || 0) : 0;
    };

    let totalVal = 0;
    const items = dynamicInventory.map(choc => {
      const balance = inventoryBalances[choc] || 0;
      const price = getRetailPrice(choc);
      const value = balance * price;
      totalVal += value;
      return { name: choc, balance, price, value };
    });

    return { items, grandTotal: totalVal };
  }, [dynamicInventory, inventoryBalances, managedChocPricesMap]);

  const allTimeProfitData = useMemo(() => {
    let totalRev = 0;
    let totalCost = 0;
    const chocProfitMap: Record<string, number> = {};

    orders.forEach(order => {
      if (order.orderStatus === 'cancelled') return;
      if (order.status === "Delivered" || order.status === "In Process") {
        const priceInfo = calculatePriceInfo(order.chocolate, order.count, order.discount, order.isDeliveryFree, order.paymentStatus, order.category, customPricesMap, order.manualDeliveryFee, order.orderStatus, managedChocPricesMap, order.pricingType, order.manualProductPrice);
        const costInfo = calculateOrderFinalCost(order, managedChocPricesMap, managedChocStickersMap, customPricesMap);

        const profit = priceInfo.fullRevenue - costInfo.finalCost;
        totalRev += priceInfo.fullRevenue;
        totalCost += costInfo.finalCost;

        if (order.chocolate) {
          const chocs = String(order.chocolate).split(',').map((c: string) => c.trim().toLowerCase()).filter(Boolean);
          const countParts = String(order.count || 0).split(',').map(c => Number(c.trim()) || 0);
          const chocCounts = chocs.map((c, i) => countParts[i] !== undefined ? countParts[i] : (countParts[0] || 0));
          const totalQty = chocCounts.reduce((sum, val) => sum + val, 0);

          chocs.forEach((chocName, idx) => {
            const qty = chocCounts[idx] || 0;
            const share = totalQty > 0 ? (qty / totalQty) : (1 / chocs.length);
            chocProfitMap[chocName] = (chocProfitMap[chocName] || 0) + (profit * share);
          });
        }
      }
    });

    return {
      totalProfit: totalRev - totalCost,
      chocProfitMap
    };
  }, [orders, customPricesMap, managedChocPricesMap, managedChocStickersMap]);

  const approximateProfitData = useMemo(() => {
    let totalInvFinalCost = 0;
    const items = currentInventoryValueData.items.map(item => {
      const profit = allTimeProfitData.chocProfitMap[item.name.toLowerCase()] || 0;
      const key = item.name.toLowerCase();
      const count = inventoryBalances[item.name] || 0;
      const purchasePricePerItem = managedChocPricesMap[key]?.wholesale || CHOCOLATE_PRICES_MAP[key]?.wholesale || 0;
      const stickerPricePerItem = managedChocStickersMap[key] !== undefined ? managedChocStickersMap[key] : 1.5;
      const stickerCost = count * stickerPricePerItem;
      const labourCost = count * 1;
      const totalPurchase = purchasePricePerItem * count;
      const invFinalCost = stickerCost + labourCost + totalPurchase;

      totalInvFinalCost += invFinalCost;
      const value = invFinalCost;
      return {
        name: item.name,
        profit,
        invValue: item.value,
        stickerCost,
        labourCost,
        totalPurchase,
        invFinalCost,
        value
      };
    });

    const grandTotal = totalInvFinalCost;
    return { items, grandTotal };
  }, [currentInventoryValueData, allTimeProfitData, inventoryBalances, managedChocPricesMap, managedChocStickersMap]);

  const trackedSalesResult = useMemo(() => {
    if (!salesTrackerChoc) return { count: 0, revenue: 0 };
    let count = 0;
    let revenue = 0;

    orders.forEach(order => {
      if (order.orderStatus === 'cancelled') return;

      const orderDateStr = parseDateToYYYYMMDD(order.deliveryDate || order.orderDate);
      if (salesTrackerFrom || salesTrackerTo) {
        if (!orderDateStr) return;
        const oTime = new Date(orderDateStr).getTime();
        const fTime = salesTrackerFrom ? new Date(salesTrackerFrom).getTime() : 0;
        const tTime = salesTrackerTo ? new Date(salesTrackerTo).getTime() : Infinity;
        if (oTime < fTime || oTime > tTime) return;
      }

      if (order.chocolate) {
        const chocs = String(order.chocolate).split(',').map(c => normalizeChocName(c.trim(), dynamicInventory));
        const countParts = String(order.count || 0).split(',').map(c => Number(c.trim()) || 0);
        const chocCounts = chocs.map((c, i) => countParts[i] !== undefined ? countParts[i] : (countParts[0] || 0));

        if (salesTrackerChoc === 'All') {
          if (order.category !== 'product') {
            const orderQty = chocCounts.reduce((sum, val) => sum + val, 0);
            count += orderQty;
            const priceInfo = calculatePriceInfo(order.chocolate, order.count, order.discount, order.isDeliveryFree, order.paymentStatus, order.category, customPricesMap, order.manualDeliveryFee, order.orderStatus, managedChocPricesMap, order.pricingType, order.manualProductPrice);
            revenue += priceInfo.chocolatePrice;
          }
        } else {
          const targetChoc = normalizeChocName(salesTrackerChoc, dynamicInventory);
          const targetIndex = chocs.indexOf(targetChoc);
          if (targetIndex !== -1 && order.category !== 'product') {
            const orderQty = chocCounts[targetIndex] || 0;
            count += orderQty;

            let multiplier = 1;
            if (order.paymentStatus === 'Partially Paid') multiplier = 0.5;
            else if (order.paymentStatus === 'Pending') multiplier = 0;

            const priceObj = managedChocPricesMap[targetChoc.toLowerCase()] || CHOCOLATE_PRICES_MAP[targetChoc.toLowerCase()] || { retail: 0, wholesale: 0 };
            const basePrice = priceObj[order.pricingType || 'retail'] || 0;
            revenue += (orderQty * basePrice * multiplier);
          }
        }
      }
    });
    return { count, revenue: Math.round(revenue) };
  }, [orders, salesTrackerChoc, salesTrackerFrom, salesTrackerTo, customPricesMap]);

  const baseDashboardOrders = useMemo(() => {
    // Use the correct per-tab filter values
    const curPaymentFilter = activeTab === 'dashboard2' ? d2PaymentFilter : d1PaymentFilter;
    const curDeliveryFilter = activeTab === 'dashboard2' ? d2DeliveryFilter : d1DeliveryFilter;
    const curOrderStatusFilter = activeTab === 'dashboard2' ? d2OrderStatusFilter : d1OrderStatusFilter;
    const curDateFilter = activeTab === 'dashboard2' ? d2DateFilter : d1DateFilter;
    const curRevenueDateType = activeTab === 'dashboard2' ? d2RevenueDateType : d1RevenueDateType;
    const curFunctionDates = activeTab === 'dashboard2' ? d2FunctionDates : d1FunctionDates;
    const curDeliveryDates = activeTab === 'dashboard2' ? d2DeliveryDates : d1DeliveryDates;
    const curDashboardSearch = debouncedDashboardSearch;
    const curCountFilter = activeTab === 'dashboard2' ? d2CountFilter : d1CountFilter;
    const curTableTypeFilter = activeTab === 'dashboard2' ? d2TableTypeFilter : d1TableTypeFilter;
    const curLocationFilter = activeTab === 'dashboard2' ? d2LocationFilter : d1LocationFilter;
    const curRoleFilter = activeTab === 'dashboard2' ? d2RoleFilter : d1RoleFilter;
    const curDuplicateFilter = activeTab === 'dashboard2' ? d2DuplicateFilter : d1DuplicateFilter;

    return orders.filter(order => {
      const pMatch = curPaymentFilter === 'All' || 
        order.paymentStatus === curPaymentFilter ||
        (curPaymentFilter === 'Full Paid' && (order.paymentStatus === 'Fully Paid' || String(order.paymentStatus || '').toLowerCase() === 'fully paid' || String(order.paymentStatus || '').toLowerCase() === 'full paid')) ||
        (curPaymentFilter === 'Partially Paid' && String(order.paymentStatus || '').toLowerCase() === 'partially paid') ||
        (curPaymentFilter === 'Pending' && String(order.paymentStatus || '').toLowerCase() === 'pending');

      const dMatch = curDeliveryFilter === 'All' || 
        order.status === curDeliveryFilter ||
        (curDeliveryFilter === 'In Process' && String(order.status || '').toLowerCase() === 'in process') ||
        (curDeliveryFilter === 'Delivered' && String(order.status || '').toLowerCase() === 'delivered');
      const osMatch = curOrderStatusFilter === 'All' || (order.orderStatus || "image edited (not paid)") === curOrderStatusFilter;

      let rangeMatch = true;
      if (curDateFilter.from || curDateFilter.to) {
        let targetDateStr = "";
        if (curRevenueDateType === 'Serial No') targetDateStr = parseDateToYYYYMMDD(order.orderDate);
        else if (curRevenueDateType === 'Order Date') targetDateStr = parseDateToYYYYMMDD(order.orderDate);
        else if (curRevenueDateType === 'Function Date') targetDateStr = parseDateToYYYYMMDD(order.functionDate);
        else targetDateStr = parseDateToYYYYMMDD(order.deliveryDate || order.functionDate || order.orderDate);

        if (targetDateStr) {
          const orderTime = new Date(targetDateStr).getTime();
          const fromTime = curDateFilter.from ? new Date(curDateFilter.from).getTime() : 0;
          const toTime = curDateFilter.to ? new Date(curDateFilter.to).getTime() : Infinity;
          rangeMatch = orderTime >= fromTime && orderTime <= toTime;
        } else {
          rangeMatch = false;
        }
      }

      let fDateMatch = true;
      if (curFunctionDates.length > 0) {
        const orderFDate = parseDateToYYYYMMDD(order.functionDate);
        fDateMatch = curFunctionDates.includes(orderFDate);
      }

      let tDelDateMatch = true;
      if (curDeliveryDates.length > 0) {
        const orderDDate = parseDateToYYYYMMDD(order.deliveryDate || order.functionDate || order.orderDate);
        tDelDateMatch = curDeliveryDates.includes(orderDDate);
      }

      let searchMatch = true;
      if (curDashboardSearch.trim()) {
        const query = curDashboardSearch.toLowerCase().trim();
        const serialNo = getSerial(order.id).toLowerCase();
        const chocName = String(order.chocolate || order.productName || "").toLowerCase();
        searchMatch =
          String(order.name || "").toLowerCase().includes(query) ||
          String(order.phone || "").includes(query) ||
          serialNo.includes(query) ||
          chocName.includes(query) ||
          String(order.orderType || "").toLowerCase().includes(query);
      }

      const countMatch = curCountFilter === 'All' || order.count.toString() === curCountFilter;
      const typeMatch = curTableTypeFilter === 'All' || (order.orderType || "Thaaru") === curTableTypeFilter;
      const categoryMatch = activeTab === 'dashboard2' ? order.category === 'product' : order.category !== 'product';
      const locationMatch = curLocationFilter === 'All' || 
        (curLocationFilter === 'Chennai' && order.isChennai) ||
        (curLocationFilter === 'Kerala' && !order.isChennai && (order.location?.toLowerCase() === 'kerala' || order.address?.toLowerCase().includes('kerala'))) ||
        (curLocationFilter === 'Others' && !order.isChennai && order.location?.toLowerCase() !== 'kerala' && !order.address?.toLowerCase().includes('kerala'));
      const roleMatch = curRoleFilter === 'All' || order.role === curRoleFilter;

      let duplicateMatch = true;
      if (curDuplicateFilter !== 'All') {
        const phoneKey = normalizePhone(order.phone);
        const isDup = phoneKey && duplicatePhoneCounts[phoneKey] && duplicatePhoneCounts[phoneKey].count > 1;
        if (curDuplicateFilter === 'Duplicates Only') {
          duplicateMatch = Boolean(isDup);
        } else if (curDuplicateFilter === 'Non-Duplicates') {
          duplicateMatch = !isDup;
        }
      }

      return pMatch && dMatch && osMatch && rangeMatch && fDateMatch && tDelDateMatch && searchMatch && countMatch && typeMatch && categoryMatch && locationMatch && roleMatch && duplicateMatch;
    });
  }, [activeTab, orders, orderSerialMap, d1PaymentFilter, d1DeliveryFilter, d1OrderStatusFilter, d1DateFilter, d1FunctionDates, d1DeliveryDates, debouncedDashboardSearch, d1CountFilter, d1RevenueDateType, d1TableTypeFilter, d1LocationFilter, d1RoleFilter, d1DuplicateFilter, d2PaymentFilter, d2DeliveryFilter, d2OrderStatusFilter, d2DateFilter, d2FunctionDates, d2DeliveryDates, d2CountFilter, d2RevenueDateType, d2TableTypeFilter, d2LocationFilter, d2RoleFilter, d2DuplicateFilter, duplicatePhoneCounts]);

  const availableChocolatesData = useMemo(() => {
    const chocolateCounts: Record<string, number> = {};
    let totalItemsCount = 0;

    baseDashboardOrders.forEach(o => {
      if (o.category !== 'product' && o.chocolate) {
        const orderChocs = String(o.chocolate).split(',').map((c: string) => c.trim()).filter(Boolean);
        const counts = String(o.count || 0).split(',').map(c => Number(c.trim()) || 0);
        orderChocs.forEach((key, idx) => {
          const qty = counts[idx] !== undefined ? counts[idx] : (counts[0] || 0);
          chocolateCounts[key] = (chocolateCounts[key] || 0) + qty;
          totalItemsCount += qty;
        });
      }
    });

    const top = Object.entries(chocolateCounts).sort((a, b) => b[1] - a[1]);
    return {
      topChocolates: top,
      preChocTotalItems: totalItemsCount,
      chocolateCountsMap: chocolateCounts
    };
  }, [baseDashboardOrders]);

  const filteredDashboardOrders = useMemo(() => {
    const activeChoc = activeTab === 'dashboard2'
      ? d2ChocFilter
      : (d1SelectedChocolateBoxFilter && d1SelectedChocolateBoxFilter !== 'All Chocolates'
          ? d1SelectedChocolateBoxFilter
          : d1ChocFilter);

    if (!activeChoc || activeChoc === 'All Chocolates' || !activeChoc.trim()) {
      return baseDashboardOrders;
    }

    const chocQuery = activeChoc.toLowerCase().trim();

    return baseDashboardOrders.filter(order => {
      const isProduct = order.category === 'product';
      if (activeTab === 'dashboard2' || isProduct) {
        const prodName = String(order.productName || order.chocolate || '').toLowerCase();
        return prodName.includes(chocQuery);
      }

      if (!order.chocolate) return false;
      const rawChocs = String(order.chocolate).split(',').map(c => c.trim().toLowerCase()).filter(Boolean);
      return rawChocs.some(c => c === chocQuery || c.includes(chocQuery) || chocQuery.includes(c));
    });
  }, [baseDashboardOrders, activeTab, d1SelectedChocolateBoxFilter, d1ChocFilter, d2ChocFilter]);

  const { totalOrders, deliveredCount, inProcessCount, totalItems, topChocolates, totalRevenue, totalDeliveryCharge, totalPendingAmount } = useMemo(() => {
    const total = filteredDashboardOrders.length;
    const delivered = filteredDashboardOrders.filter(o => o.status === "Delivered").length;
    const inProcess = filteredDashboardOrders.filter(o => o.status === "In Process").length;
    const items = filteredDashboardOrders.reduce((sum, o) => {
      const counts = String(o.count || 0).split(',').map(c => Number(c.trim()) || 0);
      return sum + counts.reduce((s, val) => s + val, 0);
    }, 0);

    let netRevenue = 0;
    let totalDelivery = 0;
    let pendingSum = 0;

    filteredDashboardOrders.forEach(o => {
      const priceInfo = calculatePriceInfo(o.chocolate, o.count, o.discount, o.isDeliveryFree || o.isChennai, o.paymentStatus, o.category, customPricesMap, o.manualDeliveryFee, o.orderStatus, managedChocPricesMap, o.pricingType, o.manualProductPrice);

      netRevenue += priceInfo.revenue;

      // Calculate pending from actual payment status and advance amount
      let orderPending = 0;
      if (o.paymentStatus === 'Full Paid') {
        orderPending = 0;
      } else if (o.paymentStatus === 'Partially Paid') {
        orderPending = Math.max(0, priceInfo.fullTotalPrice - Number(o.advanceAmount || 0));
      } else {
        // Pending = full amount
        orderPending = priceInfo.fullTotalPrice;
      }
      pendingSum += orderPending;

      if (o.paymentStatus !== 'Pending') {
        totalDelivery += priceInfo.deliveryCharge;
      }
    });

    return {
      totalOrders: total,
      deliveredCount: delivered,
      inProcessCount: inProcess,
      totalItems: items,
      topChocolates: availableChocolatesData.topChocolates,
      totalRevenue: netRevenue,
      totalDeliveryCharge: totalDelivery,
      totalPendingAmount: pendingSum
    };
  }, [filteredDashboardOrders, availableChocolatesData.topChocolates, customPricesMap, managedChocPricesMap]);

  const displayRevenue = totalRevenue;
  const displayPendingAmount = totalPendingAmount;

  const costAnalyticsData = useMemo(() => {
    if (isInvAdmin) {
      const rows = dynamicInventory.map(choc => {
        const key = choc.toLowerCase();
        const count = inventoryBalances[choc] || 0;
        const purchasePricePerItem = managedChocPricesMap[key]?.wholesale || CHOCOLATE_PRICES_MAP[key]?.wholesale || 0;
        const stickerPricePerItem = managedChocStickersMap[key] !== undefined ? managedChocStickersMap[key] : 1.5;

        const stickerCost = count * stickerPricePerItem;
        const labourCost = count * 1;
        const totalPurchase = purchasePricePerItem * count;
        const invFinalCost = stickerCost + labourCost + totalPurchase;

        return {
          serialNo: "",
          deliveryDate: "",
          chocolateName: choc,
          purchasePricePerItem,
          count,
          stickerCost,
          labourCost,
          totalPurchase,
          finalCost: invFinalCost
        };
      });

      rows.sort((a, b) => b.finalCost - a.finalCost);

      const grandTotals = rows.reduce((acc, row) => {
        acc.count += row.count;
        acc.stickerCost += row.stickerCost;
        acc.labourCost += row.labourCost;
        acc.totalPurchase += row.totalPurchase;
        acc.finalCost += row.finalCost;
        return acc;
      }, { count: 0, stickerCost: 0, labourCost: 0, totalPurchase: 0, finalCost: 0 });

      return { rows, grandTotals };
    }


    let baseOrders = orders.filter(order => order.status === "Delivered" || order.status === "In Process");

    if (currentAdminDateRange.from || currentAdminDateRange.to) {
      baseOrders = baseOrders.filter(order => {
        let targetDateStr = "";
        if (currentAdminDateType === 'Order Date') targetDateStr = parseDateToYYYYMMDD(order.orderDate);
        else if (currentAdminDateType === 'Function Date') targetDateStr = parseDateToYYYYMMDD(order.functionDate);
        else targetDateStr = parseDateToYYYYMMDD(order.deliveryDate);

        if (!targetDateStr) return false;

        const orderTime = new Date(targetDateStr).getTime();
        const fromTime = currentAdminDateRange.from ? new Date(currentAdminDateRange.from).getTime() : 0;
        const toTime = currentAdminDateRange.to ? new Date(currentAdminDateRange.to).getTime() : Infinity;

        return orderTime >= fromTime && orderTime <= toTime;
      });

    }

    const rows = baseOrders.map(order => {
      const serialNo = getSerial(order.id);
      const deliveryDate = formatToDisplayDate(order.deliveryDate || order.functionDate || order.orderDate) || "-";
      const chocolateName = order.chocolate || "N/A";

      let overrideCount: number | undefined = undefined;

      const {
        count,
        purchasePricePerItem,
        stickerCost,
        labourCost,
        totalPurchase,
        finalCost
      } = calculateOrderFinalCost(order, managedChocPricesMap, managedChocStickersMap, customPricesMap, overrideCount);

      return { serialNo, deliveryDate, chocolateName, purchasePricePerItem, count, stickerCost, labourCost, totalPurchase, finalCost };
    });

    rows.sort((a, b) => b.finalCost - a.finalCost);

    const grandTotals = rows.reduce((acc, row) => {
      acc.count += row.count;
      acc.stickerCost += row.stickerCost;
      acc.labourCost += row.labourCost;
      acc.totalPurchase += row.totalPurchase;
      acc.finalCost += row.finalCost;
      return acc;
    }, { count: 0, stickerCost: 0, labourCost: 0, totalPurchase: 0, finalCost: 0 });

    return { rows, grandTotals };
  }, [orders, currentAdminDateRange, currentAdminDateType, managedChocPricesMap, managedChocStickersMap, customPricesMap, inventoryBalances, dynamicInventory, activeTab, isInvAdmin, approximateProfitData]);

  // 🟢 NEW: Calculated Report Data exclusively for the Admin Panel Dropdown
  const adminReportData = useMemo(() => {
    if (currentAdminReportDash === 'None') return null;

    let baseOrders = orders.filter(order => order.status === "Delivered" || order.status === "In Process");

    if (currentAdminDateRange.from || currentAdminDateRange.to) {
      baseOrders = baseOrders.filter(order => {
        let targetDateStr = "";
        if (currentAdminDateType === 'Order Date') targetDateStr = parseDateToYYYYMMDD(order.orderDate);
        else if (currentAdminDateType === 'Function Date') targetDateStr = parseDateToYYYYMMDD(order.functionDate);
        else targetDateStr = parseDateToYYYYMMDD(order.deliveryDate);

        if (!targetDateStr) return false;

        const orderTime = new Date(targetDateStr).getTime();
        const fromTime = currentAdminDateRange.from ? new Date(currentAdminDateRange.from).getTime() : 0;
        const toTime = currentAdminDateRange.to ? new Date(currentAdminDateRange.to).getTime() : Infinity;

        return orderTime >= fromTime && orderTime <= toTime;
      });
    }

    if (currentAdminReportDash === 'Dashboard 1') {
      baseOrders = baseOrders.filter(o => o.category !== 'product');
    } else if (currentAdminReportDash === 'Dashboard 2') {
      baseOrders = baseOrders.filter(o => o.category === 'product');
    }

    const itemCounts: Record<string, number> = {};
    let totalRev = 0;
    let totalItems = 0;
    let totalDelivery = 0;

    baseOrders.forEach(order => {
      const priceInfo = calculatePriceInfo(order.chocolate, order.count, order.discount, order.isDeliveryFree, order.paymentStatus, order.category, customPricesMap, order.manualDeliveryFee, order.orderStatus, managedChocPricesMap, order.pricingType, order.manualProductPrice);
      totalRev += priceInfo.fullRevenue;
      const counts = String(order.count || 0).split(',').map(c => Number(c.trim()) || 0);
      const sumQty = counts.reduce((s, val) => s + val, 0);
      totalItems += sumQty;
      totalDelivery += priceInfo.deliveryCharge;


      if (order.chocolate) {
        const orderChocs = String(order.chocolate).split(',').map((c: string) => c.trim()).filter(Boolean);
        orderChocs.forEach((key, idx) => {
          const qty = counts[idx] !== undefined ? counts[idx] : (counts[0] || 0);
          itemCounts[key] = (itemCounts[key] || 0) + qty;
        });
      }
    });

    const topChocs = Object.entries(itemCounts).sort((a, b) => b[1] - a[1]);
    const chartData = topChocs.slice(0, 8).map(([name, count]) => ({ name, count }));

    return { filteredOrders: baseOrders, topChocs, chartData, totalRev, totalItems, totalDeliveryCharge: totalDelivery };
  }, [orders, currentAdminDateRange, currentAdminDateType, currentAdminReportDash, customPricesMap]);

  const trackingSearchResults = useMemo(() => {
    let result = orders;

    if (trkPaymentFilter !== 'All') {
      result = result.filter(o => o.paymentStatus === trkPaymentFilter);
    }
    if (trkDeliveryFilter !== 'All') {
      result = result.filter(o => o.status === trkDeliveryFilter);
    }
    if (trkOrderStatusFilter !== 'All') {
      result = result.filter(o => (o.orderStatus || "image edited (not paid)") === trkOrderStatusFilter);
    }

    if (debouncedTrkSearch.trim()) {
      const lowerSearch = debouncedTrkSearch.toLowerCase().trim();
      result = result.filter(o => {
        const serialNo = getSerial(o.id).toLowerCase();
        const chocName = String(o.chocolate || o.productName || "").toLowerCase();
        return (
          String(o.name || "").toLowerCase().includes(lowerSearch) ||
          String(o.phone || "").includes(lowerSearch) ||
          serialNo.includes(lowerSearch) ||
          chocName.includes(lowerSearch)
        );
      });
    }

    return result;
  }, [orders, orderSerialMap, debouncedTrkSearch, trkPaymentFilter, trkDeliveryFilter, trkOrderStatusFilter]);

  const sortedDashboardOrders = useMemo(() => {
    let sortable = [...filteredDashboardOrders];
    if (sortConfig !== null) {
      sortable.sort((a, b) => {
        if (sortConfig.key === 'id') {
          return sortConfig.direction === 'asc' ? a.id - b.id : b.id - a.id;
        }
        if (sortConfig.key === 'orderDate') {
          const dateA = new Date(parseDateToYYYYMMDD(a.orderDate) || 0).getTime();
          const dateB = new Date(parseDateToYYYYMMDD(b.orderDate) || 0).getTime();
          return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
        }
        if (sortConfig.key === 'deliveryDate') {
          const dateA = new Date(parseDateToYYYYMMDD(a.deliveryDate || a.functionDate || a.orderDate) || 0).getTime();
          const dateB = new Date(parseDateToYYYYMMDD(b.deliveryDate || b.functionDate || b.orderDate) || 0).getTime();
          return sortConfig.direction === 'asc' ? dateA - dateB : dateB - dateA;
        }
        return 0;
      });
    }
    return sortable;
  }, [filteredDashboardOrders, sortConfig]);

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
    setContinuousVisibleCount(itemsPerPage);
  }, [filteredDashboardOrders, activeTab]);

  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedDashboardOrders.slice(startIndex, startIndex + continuousVisibleCount);
  }, [sortedDashboardOrders, currentPage, itemsPerPage, continuousVisibleCount]);

  const reportData = useMemo(() => {
    let filtered = orders;

    if (reportDateRange.start || reportDateRange.end) {
      filtered = filtered.filter(order => {
        const orderDateStr = parseDateToYYYYMMDD(order.deliveryDate);
        const orderTime = orderDateStr ? new Date(orderDateStr).getTime() : 0;
        const startTime = reportDateRange.start ? new Date(reportDateRange.start).getTime() : 0;
        const endTime = reportDateRange.end ? new Date(reportDateRange.end).getTime() : Infinity;
        return orderTime >= startTime && orderTime <= endTime;
      });
    }

    if (reportDashboardFilter !== "All") {
      filtered = filtered.filter(order => {
        const isProduct = order.category === 'product';
        if (reportDashboardFilter === "Dashboard 1") return !isProduct;
        if (reportDashboardFilter === "Dashboard 2") return isProduct;
        return true;
      });
    }

    if (reportOrderTypeFilter !== "All") {
      filtered = filtered.filter(order => (order.orderType || "Sabi") === reportOrderTypeFilter);
    }

    const chocolateCounts: Record<string, number> = {};
    let totalRev = 0;
    let totalItems = 0;
    let totalDelivery = 0;
    let totalCost = 0;

    filtered.forEach(order => {
      if (order.status === "Delivered" || order.status === "In Process") {
        const priceInfo = calculatePriceInfo(order.chocolate, order.count, order.discount, order.isDeliveryFree, order.paymentStatus, order.category, customPricesMap, order.manualDeliveryFee, order.orderStatus, managedChocPricesMap, order.pricingType, order.manualProductPrice);
        totalRev += priceInfo.fullRevenue;
        const counts = String(order.count || 0).split(',').map(c => Number(c.trim()) || 0);
        const sumQty = counts.reduce((s, val) => s + val, 0);
        totalItems += sumQty;
        totalDelivery += priceInfo.deliveryCharge;

        const costInfo = calculateOrderFinalCost(order, managedChocPricesMap, managedChocStickersMap, customPricesMap);
        totalCost += costInfo.finalCost;

        if (order.chocolate) {
          const orderChocs = String(order.chocolate).split(',').map((c: string) => c.trim()).filter(Boolean);
          orderChocs.forEach((key, idx) => {
            const qty = counts[idx] !== undefined ? counts[idx] : (counts[0] || 0);
            chocolateCounts[key] = (chocolateCounts[key] || 0) + qty;
          });
        }
      }
    });

    const topChocs = Object.entries(chocolateCounts).sort((a, b) => b[1] - a[1]);
    const chartData = topChocs.slice(0, 8).map(([name, count]) => ({ name, count }));

    return {
      filteredOrders: filtered,
      topChocs,
      chartData,
      totalRev,
      totalItems,
      totalDeliveryCharge: totalDelivery,
      totalCost,
      totalProfit: totalRev - totalCost
    };
  }, [orders, reportDateRange, customPricesMap, reportDashboardFilter, reportOrderTypeFilter, managedChocPricesMap, managedChocStickersMap]);




  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      const visibleIds = filteredDashboardOrders.map(o => o.id);
      setSelectedOrders([...new Set([...selectedOrders, ...visibleIds])]);
    } else {
      const visibleIds = filteredDashboardOrders.map(o => o.id);
      setSelectedOrders(selectedOrders.filter(id => !visibleIds.includes(id)));
    }
  };

  const handleSelectOrder = (id: number) => {
    if (selectedOrders.includes(id)) {
      setSelectedOrders(selectedOrders.filter(orderId => orderId !== id));
    } else {
      setSelectedOrders([...selectedOrders, id]);
    }
  };

  const visibleIds = filteredDashboardOrders.map(o => o.id);
  const isAllSelected = visibleIds.length > 0 && visibleIds.every(id => selectedOrders.includes(id));

  const handleBulkAction = async (actionType: string) => {
    try {
      const selectedFireOrders = orders.filter(o => selectedOrders.includes(o.id));

      for (const order of selectedFireOrders) {
        const orderRef = doc(db, "orders", order.fireId);
        let updatedOrder = { ...order };

        if (actionType === "Delivered" || actionType === "In Process") {
          updatedOrder.status = actionType;
        } else {
          updatedOrder.paymentStatus = actionType;
        }

        const priceData = calculatePriceInfo(updatedOrder.chocolate, updatedOrder.count, updatedOrder.discount, updatedOrder.isDeliveryFree, updatedOrder.paymentStatus, updatedOrder.category, customPricesMap, updatedOrder.manualDeliveryFee, updatedOrder.orderStatus, managedChocPricesMap, updatedOrder.pricingType, updatedOrder.manualProductPrice);


        await updateDoc(orderRef, {
          status: updatedOrder.status,
          paymentStatus: updatedOrder.paymentStatus,
          totalOrderPrice: priceData.fullTotalPrice,
          itemSubtotal: priceData.fullChocolatePrice,
          calculatedDeliveryFee: priceData.fullDeliveryCharge
        });
      }
      setSelectedOrders([]);
    } catch (err) { console.error("Bulk action failed:", err); }
  };

  const handleBulkDelete = async () => {
    if (window.confirm(`Are you sure you want to delete ${selectedOrders.length} records?`)) {
      try {
        const selectedFireOrders = orders.filter(o => selectedOrders.includes(o.id));
        const deletedRecords: { originalFireId: string; originalOrderData: any; trashFireId: string }[] = [];

        for (const order of selectedFireOrders) {
          try {
            const trashOrder = {
              ...order,
              deletedAt: Date.now(),
              deletedBy: role ? `${role} (${loggedInName})` : loggedInName
            };
            const originalFireId = order.fireId;
            const originalOrderData = { ...order };
            delete (originalOrderData as any).fireId;

            delete (trashOrder as any).fireId;
            const trashRef = await addDoc(collection(db, "trash_orders"), trashOrder);
            const trashFireId = trashRef.id;

            await deleteDoc(doc(db, "orders", originalFireId));

            deletedRecords.push({
              originalFireId,
              originalOrderData,
              trashFireId
            });
          } catch (err) {
            console.error("Failed to copy bulk order to trash:", err);
          }
        }

        // Track bulk deletion in undo stack
        if (deletedRecords.length > 0) {
          undoStackRef.current.push({
            type: 'BULK_DELETE',
            undo: async () => {
              for (const rec of deletedRecords) {
                await setDoc(doc(db, "orders", rec.originalFireId), rec.originalOrderData);
                await deleteDoc(doc(db, "trash_orders", rec.trashFireId));
              }
              logActivity(`Restored ${deletedRecords.length} bulk deleted orders`, 'Trash Bin');
            },
            redo: async () => {
              for (const rec of deletedRecords) {
                const trashOrder = {
                  ...rec.originalOrderData,
                  deletedAt: Date.now(),
                  deletedBy: role ? `${role} (${loggedInName})` : loggedInName
                };
                delete (trashOrder as any).fireId;
                await setDoc(doc(db, "trash_orders", rec.trashFireId), trashOrder);
                await deleteDoc(doc(db, "orders", rec.originalFireId));
              }
              logActivity(`Deleted ${deletedRecords.length} bulk orders via Redo`, 'Bulk Action');
            }
          });
          redoStackRef.current = [];
          toast.success(`Moved ${deletedRecords.length} orders to trash. Press Ctrl+Z to undo.`);
        }

        setSelectedOrders([]);
      } catch (err) {
        console.error("Bulk delete failed:", err);
      }
    }
  };

  const handleDiscountUpdate = async (id: number, fireId: string, value: string) => {
    const numValue = Number(value) || 0;
    const orderToUpdate = orders.find(o => o.id === id);
    if (!orderToUpdate) return;

    const updatedOrder = { ...orderToUpdate, discount: numValue };
    const priceData = calculatePriceInfo(updatedOrder.chocolate, updatedOrder.count, updatedOrder.discount, updatedOrder.isDeliveryFree, updatedOrder.paymentStatus, updatedOrder.category, customPricesMap, updatedOrder.manualDeliveryFee, updatedOrder.orderStatus, managedChocPricesMap, updatedOrder.pricingType, updatedOrder.manualProductPrice);

    setOrders(prev => prev.map(o => o.id === id ? { ...o, discount: numValue, totalOrderPrice: priceData.fullTotalPrice, itemSubtotal: priceData.fullChocolatePrice, calculatedDeliveryFee: priceData.fullDeliveryCharge } : o));
    if (fireId) {
      try { await updateDoc(doc(db, "orders", fireId), { discount: numValue, totalOrderPrice: priceData.fullTotalPrice, itemSubtotal: priceData.fullChocolatePrice, calculatedDeliveryFee: priceData.fullDeliveryCharge }); } catch (e) { }
    }
  };

  const handleAdvanceUpdate = async (id: number, fireId: string, value: string) => {
    const numValue = Number(value) || 0;
    const orderToUpdate = orders.find(o => o.id === id);
    if (!orderToUpdate) return;

    // Use current order data to calculate fullTotalPrice
    const priceData = calculatePriceInfo(orderToUpdate.chocolate, orderToUpdate.count, orderToUpdate.discount, orderToUpdate.isDeliveryFree, orderToUpdate.paymentStatus, orderToUpdate.category, customPricesMap, orderToUpdate.manualDeliveryFee, orderToUpdate.orderStatus, managedChocPricesMap, orderToUpdate.pricingType, orderToUpdate.manualProductPrice);

    let newPaymentStatus = 'Pending';
    if (numValue >= priceData.fullTotalPrice && priceData.fullTotalPrice > 0) {
      newPaymentStatus = 'Full Paid';
    } else if (numValue > 0) {
      newPaymentStatus = 'Partially Paid';
    }

    const updatedOrder = { ...orderToUpdate, advanceAmount: numValue, paymentStatus: newPaymentStatus };
    // Recalculate priceData with new payment status if it affects calculations (though fullTotalPrice usually doesn't)
    const finalPriceData = calculatePriceInfo(updatedOrder.chocolate, updatedOrder.count, updatedOrder.discount, updatedOrder.isDeliveryFree, updatedOrder.paymentStatus, updatedOrder.category, customPricesMap, updatedOrder.manualDeliveryFee, updatedOrder.orderStatus, managedChocPricesMap, updatedOrder.pricingType, updatedOrder.manualProductPrice);

    setOrders(prev => prev.map(o => o.id === id ? { ...o, advanceAmount: numValue, paymentStatus: newPaymentStatus, totalOrderPrice: finalPriceData.fullTotalPrice, itemSubtotal: finalPriceData.fullChocolatePrice, calculatedDeliveryFee: finalPriceData.fullDeliveryCharge } : o));
    if (fireId) {
      try { await updateDoc(doc(db, "orders", fireId), { advanceAmount: numValue, paymentStatus: newPaymentStatus, totalOrderPrice: finalPriceData.fullTotalPrice, itemSubtotal: finalPriceData.fullChocolatePrice, calculatedDeliveryFee: finalPriceData.fullDeliveryCharge }); } catch (e) { }
    }
  };

  const handlePaymentStatusUpdate = async (id: any, fireId: string, newPaymentStatus: string) => {
    const orderToUpdate = orders.find(o => o.id === id);
    if (!orderToUpdate) return;

    const updatedOrder = { ...orderToUpdate, paymentStatus: newPaymentStatus };
    const priceData = calculatePriceInfo(updatedOrder.chocolate, updatedOrder.count, updatedOrder.discount, updatedOrder.isDeliveryFree, updatedOrder.paymentStatus, updatedOrder.category, customPricesMap, updatedOrder.manualDeliveryFee, updatedOrder.orderStatus, managedChocPricesMap, updatedOrder.pricingType, updatedOrder.manualProductPrice);

    setOrders(prev => prev.map(o => o.id === id ? { ...o, paymentStatus: newPaymentStatus, totalOrderPrice: priceData.fullTotalPrice, itemSubtotal: priceData.fullChocolatePrice, calculatedDeliveryFee: priceData.fullDeliveryCharge } : o));
    if (fireId) {
      try { await updateDoc(doc(db, "orders", fireId), { paymentStatus: newPaymentStatus, totalOrderPrice: priceData.fullTotalPrice, itemSubtotal: priceData.fullChocolatePrice, calculatedDeliveryFee: priceData.fullDeliveryCharge }); } catch (e) { }
    }
  };

  const handleDeliveryStatusUpdate = async (id: any, fireId: string, newStatus: string) => {
    const orderToUpdate = orders.find(o => o.id === id);
    if (!orderToUpdate) return;

    const updatedOrder = { ...orderToUpdate, status: newStatus };
    const priceData = calculatePriceInfo(updatedOrder.chocolate, updatedOrder.count, updatedOrder.discount, updatedOrder.isDeliveryFree, updatedOrder.paymentStatus, updatedOrder.category, customPricesMap, updatedOrder.manualDeliveryFee, updatedOrder.orderStatus, managedChocPricesMap, updatedOrder.pricingType, updatedOrder.manualProductPrice);

    setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus, totalOrderPrice: priceData.fullTotalPrice, itemSubtotal: priceData.fullChocolatePrice, calculatedDeliveryFee: priceData.fullDeliveryCharge } : o));
    if (fireId) {
      try { await updateDoc(doc(db, "orders", fireId), { status: newStatus, totalOrderPrice: priceData.fullTotalPrice, itemSubtotal: priceData.fullChocolatePrice, calculatedDeliveryFee: priceData.fullDeliveryCharge }); } catch (e) { }
    }
  };

  const handleOrderStatusUpdate = async (id: any, fireId: string, newOrderStatus: string) => {
    const orderToUpdate = orders.find(o => o.id === id);
    if (!orderToUpdate) return;

    const updatedOrder = { ...orderToUpdate, orderStatus: newOrderStatus };
    const priceData = calculatePriceInfo(updatedOrder.chocolate, updatedOrder.count, updatedOrder.discount, updatedOrder.isDeliveryFree, updatedOrder.paymentStatus, updatedOrder.category, customPricesMap, updatedOrder.manualDeliveryFee, updatedOrder.orderStatus, managedChocPricesMap, updatedOrder.pricingType, updatedOrder.manualProductPrice);

    setOrders(prev => prev.map(o => o.id === id ? { ...o, orderStatus: newOrderStatus, totalOrderPrice: priceData.fullTotalPrice, itemSubtotal: priceData.fullChocolatePrice, calculatedDeliveryFee: priceData.fullDeliveryCharge } : o));
    if (fireId) {
      try { await updateDoc(doc(db, "orders", fireId), { orderStatus: newOrderStatus, totalOrderPrice: priceData.fullTotalPrice, itemSubtotal: priceData.fullChocolatePrice, calculatedDeliveryFee: priceData.fullDeliveryCharge }); } catch (e) { }
    }
  };

  const handleOrderTypeUpdate = async (id: any, fireId: string, newOrderType: string) => {
    const orderToUpdate = orders.find(o => o.id === id);
    if (!orderToUpdate) return;

    setOrders(prev => prev.map(o => o.id === id ? { ...o, orderType: newOrderType } : o));
    if (fireId) {
      try {
        await updateDoc(doc(db, "orders", fireId), { orderType: newOrderType });
      } catch (e) {
        console.error("Failed to update orderType:", e);
      }
    }
  };

  const handleRoleUpdate = async (id: any, fireId: string, newRole: string) => {
    const orderToUpdate = orders.find(o => o.id === id);
    if (!orderToUpdate) return;

    setOrders(prev => prev.map(o => o.id === id ? { ...o, role: newRole } : o));
    if (fireId) {
      try {
        await updateDoc(doc(db, "orders", fireId), { role: newRole });
      } catch (e) {
        console.error("Failed to update role:", e);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    let newFormData = { ...formData, [name]: value };

    if (name === 'advanceAmount' || name === 'count' || name === 'discount' || name === 'chocolate' || name === 'manualDeliveryFee' || name === 'manualProductPrice') {

      const currentAdvance = name === 'advanceAmount' ? Number(value) : Number(formData.advanceAmount);
      const priceData = calculatePriceInfo(
        name === 'chocolate' ? value : formData.chocolate,
        name === 'count' ? value : formData.count,
        name === 'discount' ? value : formData.discount,
        formData.isDeliveryFree || formData.isChennai,
        formData.paymentStatus,
        formData.category,
        customPricesMap,
        name === 'manualDeliveryFee' ? value : formData.manualDeliveryFee,
        formData.orderStatus,
        managedChocPricesMap,
        formData.pricingType,
        name === 'manualProductPrice' ? value : formData.manualProductPrice
      );


      if (formData.fireId === null) {
        if (currentAdvance >= priceData.fullTotalPrice && priceData.fullTotalPrice > 0) {
          newFormData.paymentStatus = 'Full Paid';
        } else if (currentAdvance > 0) {
          newFormData.paymentStatus = 'Partially Paid';
        } else {
          newFormData.paymentStatus = 'Pending';
        }
      }
    }

    setFormData(newFormData);
  };

  const handleAddClick = (categoryOverride?: any) => {
    const today = new Date().toISOString().split('T')[0];
    const category = (categoryOverride === 'chocolate' || categoryOverride === 'product')
      ? categoryOverride
      : (activeTab === 'dashboard2' ? 'product' : 'chocolate');
    setFormData({ id: null, fireId: null, name: "", phone: "", orderDate: today, functionDate: "", deliveryDate: "", chocolate: "", count: "", address: "", status: "In Process", paymentStatus: "Pending", discount: 0, isDeliveryFree: false, isChennai: false, orderType: getOrderTypeName(orderTypes[0]) || "Sabi", role: "Others", orderStatus: "image edited (not paid)", category, manualDeliveryFee: "", advanceAmount: "", manualProductPrice: "", pricingType: 'retail' });
    setChocolateRows([{ chocolate: "", count: "" }]);
    setProductRows([{ productName: "", quantity: "", price: "" }]);
    setOrderTypeOthersToggle(true);
    setIsModalOpen(true);
  };

  const handleAddOrderFromNotification = async (n: any) => {
    const today = new Date().toISOString().split('T')[0];
    const category = activeTab === 'dashboard2' ? 'product' : 'chocolate';
    const birthdayVal = n.birthdayDate ? parseDateToYYYYMMDD(n.birthdayDate) : "";

    try {
      const notifyDocRef = doc(db, 'daily_tasks_board', 'notifications');
      const updated = notifications.map(notif => notif.id === n.id ? { ...notif, read: true } : notif);
      await setDoc(notifyDocRef, { items: updated }, { merge: true });
    } catch (e) {
      console.error("Failed to mark notification as read:", e);
    }

    setFormData({
      id: null,
      fireId: null,
      name: n.cardTitle || "",
      phone: n.phoneNumber || "",
      orderDate: today,
      functionDate: birthdayVal,
      deliveryDate: birthdayVal,
      chocolate: "",
      count: n.chocolateCount || "",
      address: n.comments || "",
      status: "In Process",
      paymentStatus: "Pending",
      discount: 0,
      isDeliveryFree: false,
      isChennai: false,
      orderType: getOrderTypeName(orderTypes[0]) || "Sabi",
      role: "Others",
      orderStatus: "image edited (not paid)",
      category,
      manualDeliveryFee: "",
      advanceAmount: "",
      manualProductPrice: "",
      pricingType: 'retail'
    });
    setChocolateRows([{ chocolate: "", count: String(n.chocolateCount || "") }]);
    setOrderTypeOthersToggle(true);
    setIsModalOpen(true);
  };


  const handleEditClick = (order: any) => {
    const fallbackRole = order.orderType === 'Self' ? 'Self' : 'Others';
    const currentRole = order.role || fallbackRole;
    setFormData({
      ...order,
      fireId: order.fireId, // 🟢 IMPORTANT: Ithu thaan edit aaga use aagum
      id: order.id,
      orderDate: order.orderDate ? parseDateToYYYYMMDD(order.orderDate) : parseDateToYYYYMMDD(order.functionDate),
      functionDate: parseDateToYYYYMMDD(order.functionDate),
      deliveryDate: parseDateToYYYYMMDD(order.deliveryDate || order.functionDate),
      address: order.address || "",
      discount: order.discount || 0,
      isDeliveryFree: order.isDeliveryFree || false,
      isChennai: order.isChennai || false,
      orderType: order.orderType || "Thaaru",
      role: currentRole,
      orderStatus: order.orderStatus || "image edited (not paid)",
      category: order.category || (activeTab === 'dashboard2' ? 'product' : 'chocolate'),
      manualDeliveryFee: order.manualDeliveryFee || "",
      advanceAmount: order.advanceAmount || "",
      manualProductPrice: order.manualProductPrice || "",
      pricingType: order.pricingType || 'retail'
    });

    // Populate chocolateRows by splitting chocolate and count values
    const chocs = String(order.chocolate || "").split(',').map(c => c.trim()).filter(Boolean);
    const counts = String(order.count || "").split(',').map(c => c.trim()).filter(Boolean);
    const rows = chocs.map((choc, idx) => ({
      chocolate: choc,
      count: counts[idx] !== undefined ? counts[idx] : (counts[0] || "")
    }));
    setChocolateRows(rows.length > 0 ? rows : [{ chocolate: "", count: "" }]);

    setOrderTypeOthersToggle(currentRole === 'Others');
    setIsModalOpen(true);
  };

  const handlePreviewClick = (order: any) => {
    setPreviewData({ ...order, orderDate: order.orderDate || order.functionDate });
    setIsPreviewOpen(true);
  };

  const logActivity = async (action: string, module: string = '') => {
    try {
      await addDoc(collection(db, "activity_logs"), {
        action,
        module,
        performedBy: loggedInName || 'Unknown',
        username: loggedInName || 'Unknown',
        role: role || 'Unknown',
        timestamp: Date.now()
      });
    } catch (e) { console.error("logActivity error:", e); }
  };

  const handleDeleteClick = async (id: any) => {
    if (window.confirm("Are you sure you want to delete this record?")) {
      const order = orders.find(o => o.id === id);
      if (order) {
        try {
          const trashOrder = {
            ...order,
            deletedAt: Date.now(),
            deletedBy: role ? `${role} (${loggedInName})` : loggedInName
          };
          const originalFireId = order.fireId;
          const originalOrderData = { ...order };
          delete (originalOrderData as any).fireId;

          delete (trashOrder as any).fireId;
          const trashRef = await addDoc(collection(db, "trash_orders"), trashOrder);
          const trashFireId = trashRef.id;

          await deleteDoc(doc(db, "orders", originalFireId));
          setSelectedOrders(selectedOrders.filter(selectedId => selectedId !== id));
          logActivity(`Deleted Order: ${order.name} (${order.chocolate || 'Product'} x${order.count})`,
            order.category === 'product' ? 'Order Management (Products)' : 'Order Management (Chocolates)');

          // Track in local undo stack
          undoStackRef.current.push({
            type: 'DELETE_ORDER',
            undo: async () => {
              await setDoc(doc(db, "orders", originalFireId), originalOrderData);
              await deleteDoc(doc(db, "trash_orders", trashFireId));
              logActivity(`Restored Order: ${order.name}`, 'Trash Bin');
            },
            redo: async () => {
              const trashOrder = {
                ...originalOrderData,
                deletedAt: Date.now(),
                deletedBy: role ? `${role} (${loggedInName})` : loggedInName
              };
              delete (trashOrder as any).fireId;
              await setDoc(doc(db, "trash_orders", trashFireId), trashOrder);
              await deleteDoc(doc(db, "orders", originalFireId));
              logActivity(`Deleted Order: ${order.name} via Redo`, order.category === 'product' ? 'Order Management (Products)' : 'Order Management (Chocolates)');
            }
          });
          redoStackRef.current = [];

          toast.success("Order moved to trash", {
            action: {
              label: "Undo",
              onClick: async () => {
                try {
                  await setDoc(doc(db, "orders", originalFireId), originalOrderData);
                  await deleteDoc(doc(db, "trash_orders", trashFireId));
                  toast.success("Order restored successfully!");
                  logActivity(`Restored Order: ${order.name}`, 'Trash Bin');
                } catch (err) {
                  console.error("Undo restore failed:", err);
                  toast.error("Failed to restore order.");
                }
              }
            }
          });
        } catch (err) {
          console.error("Failed to copy order to trash:", err);
        }
      }
    }
  };

  const handleRestoreTrashOrder = async (order: any) => {
    try {
      const restoredOrder = { ...order };
      const trashFireId = restoredOrder.fireId;
      delete restoredOrder.deletedAt;
      delete restoredOrder.deletedBy;
      delete restoredOrder.fireId;

      await addDoc(collection(db, "orders"), restoredOrder);
      await deleteDoc(doc(db, "trash_orders", trashFireId));
      logActivity(`Restored Order from Trash: ${order.name} (${order.chocolate || 'Product'})`,
        order.category === 'product' ? 'Order Management (Products)' : 'Order Management (Chocolates)');
    } catch (err) {
      console.error("Restore failed:", err);
    }
  };

  const handleUndoActivity = async (log: any) => {
    const action = (log.action || '').toLowerCase();
    const actionStr = log.action || '';

    try {
      // 1. UNDO DELETED ORDER
      if (action.startsWith('deleted order:')) {
        const parts = actionStr.replace(/Deleted Order:\s*/i, '').split(' (');
        const customerName = parts[0]?.trim();

        const matchingTrash = trashOrders.find(t => t.name?.trim() === customerName);
        if (matchingTrash) {
          await handleRestoreTrashOrder(matchingTrash);
          toast.success(`Restored deleted order for "${customerName}"`);
          logActivity(`Undid Action: Restored Deleted Order for ${customerName}`, 'Platform History');
        } else {
          toast.error("Could not find this order in the Trash Bin");
        }
        return;
      }

      // 2. UNDO ADDED NEW ORDER
      if (action.startsWith('added new order:')) {
        const parts = actionStr.replace(/Added New Order:\s*/i, '').split(' (');
        const customerName = parts[0]?.trim();

        const matchingOrder = orders.find(o => o.name?.trim() === customerName);
        if (matchingOrder) {
          const trashOrder = {
            ...matchingOrder,
            deletedAt: Date.now(),
            deletedBy: localStorage.getItem('loggedInName') || 'System'
          };
          const trashFireId = matchingOrder.fireId;
          delete (trashOrder as any).fireId;

          await addDoc(collection(db, "trash_orders"), trashOrder);
          await deleteDoc(doc(db, "orders", trashFireId));

          toast.success(`Removed added order for "${customerName}" (moved to Trash)`);
          logActivity(`Undid Action: Removed Added Order for ${customerName}`, 'Platform History');
        } else {
          toast.error("Could not find the added order (it may have already been deleted)");
        }
        return;
      }

      // 3. UNDO ADDED PRODUCT
      if (action.startsWith('added new product:')) {
        const parts = actionStr.replace(/Added New Product:\s*/i, '').split(' (');
        const productName = parts[0]?.trim();

        const matchingProd = customProducts.find(p => p.name?.trim() === productName);
        if (matchingProd) {
          await deleteDoc(doc(db, "products", matchingProd.fireId));
          toast.success(`Deleted added product "${productName}"`);
          logActivity(`Undid Action: Deleted Added Product "${productName}"`, 'Platform History');
        } else {
          toast.error("Product not found in database");
        }
        return;
      }

      // 4. UNDO DELETED PRODUCT
      if (action.startsWith('deleted product:')) {
        const productName = actionStr.replace(/Deleted Product:\s*/i, '').trim();

        const prevLog = activityLogs.find(l =>
          (l.action || '').toLowerCase().includes(productName.toLowerCase()) &&
          (l.action || '').toLowerCase().includes('₹')
        );

        let price = 0;
        if (prevLog) {
          const matchPrice = (prevLog.action || '').match(/₹([\d.]+)/);
          if (matchPrice) price = parseFloat(matchPrice[1]);
        }

        if (price > 0) {
          await addDoc(collection(db, "products"), {
            name: productName,
            price: price,
            createdAt: new Date().toISOString()
          });
          toast.success(`Restored deleted product "${productName}" with price ₹${price}`);
          logActivity(`Undid Action: Restored Deleted Product "${productName}"`, 'Platform History');
        } else {
          toast.error(`Could not retrieve price for "${productName}" to restore it.`);
        }
        return;
      }

      // 5. UNDO ADDED CHOCOLATE
      if (action.startsWith('added chocolate:')) {
        const parts = actionStr.replace(/Added Chocolate:\s*/i, '').split(' (');
        const chocName = parts[0]?.trim();

        const matchingChoc = managedChocolates.find(c => c.name?.trim() === chocName);
        if (matchingChoc) {
          await deleteDoc(doc(db, "managed_chocolates", matchingChoc.fireId));
          toast.success(`Deleted added chocolate "${chocName}"`);
          logActivity(`Undid Action: Deleted Added Chocolate "${chocName}"`, 'Platform History');
        } else {
          toast.error("Chocolate not found in database");
        }
        return;
      }

      // 6. UNDO DELETED CHOCOLATE
      if (action.startsWith('deleted chocolate:')) {
        const chocName = actionStr.replace(/Deleted Chocolate:\s*/i, '').trim();

        const prevLog = activityLogs.find(l =>
          (l.action || '').toLowerCase().includes(chocName.toLowerCase()) &&
          (l.action || '').toLowerCase().includes('r:₹')
        );

        let retail = 0;
        let wholesale = 0;
        if (prevLog) {
          const matchPrices = (prevLog.action || '').match(/R:₹([\d.]+)\s+W:₹([\d.]+)/);
          if (matchPrices) {
            retail = parseFloat(matchPrices[1]);
            wholesale = parseFloat(matchPrices[2]);
          }
        }

        if (retail > 0 && wholesale > 0) {
          await addDoc(collection(db, "managed_chocolates"), {
            name: chocName,
            retailPrice: retail,
            wholesalePrice: wholesale,
            createdAt: new Date().toISOString()
          });
          toast.success(`Restored deleted chocolate "${chocName}" (R:₹${retail} W:₹${wholesale})`);
          logActivity(`Undid Action: Restored Deleted Chocolate "${chocName}"`, 'Platform History');
        } else {
          toast.error(`Could not retrieve pricing details for "${chocName}" to restore it.`);
        }
        return;
      }

      toast.info("This action type cannot be automatically undone.");
    } catch (err) {
      console.error("Revert failed:", err);
      toast.error("Failed to undo this action");
    }
  };

  useEffect(() => {
    const handleGlobalKeyDown = async (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
        // Allow native undo/redo to work in text boxes/inputs
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      const isZ = e.key.toLowerCase() === 'z';
      const isY = e.key.toLowerCase() === 'y';

      // 1. Check REDO shortcut: Ctrl + Shift + Z OR Ctrl + Y
      if ((isCtrlOrCmd && e.shiftKey && isZ) || (isCtrlOrCmd && isY)) {
        e.preventDefault();

        // If Daily Tasks is active, dispatch redo event
        if (activeTab === 'daily_tasks') {
          const event = new CustomEvent('sabi-daily-tasks-redo');
          window.dispatchEvent(event);
          return;
        }

        if (redoStackRef.current.length > 0) {
          const lastAction = redoStackRef.current.pop();
          if (lastAction) {
            toast.loading("Redoing last action...", { id: "global-redo" });
            try {
              await lastAction.redo();
              undoStackRef.current.push(lastAction);
              if (undoStackRef.current.length > 20) {
                undoStackRef.current.shift();
              }
              toast.success("Action redone successfully!", { id: "global-redo" });
            } catch (err) {
              console.error("Redo failed:", err);
              toast.error("Failed to redo last action", { id: "global-redo" });
            }
          }
        } else {
          toast.info("No recent actions found to redo", { id: "global-redo" });
        }
        return;
      }

      // 2. Check UNDO shortcut: Ctrl + Z (without Shift)
      if (isCtrlOrCmd && !e.shiftKey && isZ) {
        e.preventDefault();

        // If Daily Tasks is active, dispatch undo event
        if (activeTab === 'daily_tasks') {
          const event = new CustomEvent('sabi-daily-tasks-undo');
          window.dispatchEvent(event);
          return;
        }

        if (undoStackRef.current.length > 0) {
          const lastAction = undoStackRef.current.pop();
          if (lastAction) {
            toast.loading("Undoing last action...", { id: "global-undo" });
            try {
              await lastAction.undo();
              redoStackRef.current.push(lastAction);
              if (redoStackRef.current.length > 20) {
                redoStackRef.current.shift();
              }
              toast.success("Action undone successfully!", { id: "global-undo" });
            } catch (err) {
              console.error("Undo failed:", err);
              toast.error("Failed to undo last action", { id: "global-undo" });
            }
          }
        } else {
          // Filter logs starting with 'deleted'
          const deleteLogs = activityLogs.filter(log =>
            (log.action || '').toLowerCase().startsWith('deleted ')
          );

          if (deleteLogs.length > 0) {
            // Sort by timestamp desc to find the most recent deletion log
            const sortedDeletes = [...deleteLogs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            const lastDeleteLog = sortedDeletes[0];

            toast.loading("Undoing last deleted item...", { id: "global-undo" });
            try {
              await handleUndoActivity(lastDeleteLog);
              toast.success("Last deletion undone successfully!", { id: "global-undo" });
            } catch (err) {
              toast.error("Failed to undo last deletion", { id: "global-undo" });
            }
          } else {
            toast.info("No recent actions found to undo", { id: "global-undo" });
          }
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activityLogs, trashOrders, orders, customProducts, managedChocolates, activeTab]);

  // Keep table scrolled to the leftmost (Serial Number) column by default in RTL container
  useEffect(() => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollLeft = -tableContainerRef.current.scrollWidth;
    }
  }, [sortedDashboardOrders, currentPage]);

  const handleDeleteTrashOrderPermanently = async (fireId: string) => {
    const orderToDelete = trashOrders.find(t => t.fireId === fireId);
    if (!orderToDelete) return;

    if (window.confirm(`Are you sure you want to permanently delete this record from Trash? This cannot be undone.`)) {
      try {
        const originalTrashData = { ...orderToDelete };
        delete (originalTrashData as any).fireId;

        await deleteDoc(doc(db, "trash_orders", fireId));
        logActivity(`Permanently Deleted Order from Trash: ${orderToDelete.name}`, 'Trash Bin');

        // Register action on local undo stack for Ctrl + Z / Cmd + Z support
        undoStackRef.current.push({
          type: 'PERMANENT_DELETE_TRASH_ORDER',
          undo: async () => {
            await setDoc(doc(db, "trash_orders", fireId), originalTrashData);
            logActivity(`Undid Action: Restored Permanent Deleted Order to Trash: ${orderToDelete.name}`, 'Trash Bin');
          },
          redo: async () => {
            await deleteDoc(doc(db, "trash_orders", fireId));
            logActivity(`Redid Action: Permanently Deleted Order from Trash: ${orderToDelete.name}`, 'Trash Bin');
          }
        });
        redoStackRef.current = [];

        toast.success(`Permanently deleted order for ${orderToDelete.name}. Press Ctrl+Z to undo.`);
      } catch (err) {
        console.error("Permanent deletion failed:", err);
        toast.error("Failed to delete order permanently");
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingOrder) return;
    setIsSavingOrder(true);

    const priceData = calculatePriceInfo(formData.chocolate, formData.count, formData.discount, formData.isDeliveryFree || formData.isChennai, formData.paymentStatus, formData.category, customPricesMap, formData.manualDeliveryFee, formData.orderStatus, managedChocPricesMap, formData.pricingType, formData.manualProductPrice);

    const rawAdvance = Number(formData.advanceAmount) || 0;
    const finalPaymentStatus = formData.paymentStatus || 'Pending';

    const formattedOrder: any = {
      ...formData,
      phone: formatPhoneNumber(formData.phone),
      orderDate: formatToDisplayDate(formData.orderDate) || "",
      functionDate: formatToDisplayDate(formData.functionDate) || "",
      deliveryDate: formatToDisplayDate(formData.deliveryDate) || "",
      discount: Number(formData.discount) || 0,
      manualDeliveryFee: Number(formData.manualDeliveryFee) || 0,
      advanceAmount: rawAdvance,
      manualProductPrice: Number(formData.manualProductPrice) || 0,
      paymentStatus: finalPaymentStatus,

      isDeliveryFree: Boolean(formData.isDeliveryFree || formData.isChennai),
      isChennai: Boolean(formData.isChennai),
      totalOrderPrice: priceData.fullTotalPrice || 0,
      itemSubtotal: priceData.fullChocolatePrice || 0,
      calculatedDeliveryFee: priceData.fullDeliveryCharge || 0
    };

    // For product-category orders with multi-product rows, attach products array
    if (formData.category === 'product' && productRows.length > 0) {
      const validRows = productRows.filter(r => r.productName.trim());
      if (validRows.length > 0) {
        formattedOrder.products = validRows.map(r => ({
          productName: r.productName.trim(),
          quantity: Number(r.quantity) || 0,
          price: Number(r.price) || 0,
          productId: customProducts.find(p => p.name?.trim().toLowerCase() === r.productName.trim().toLowerCase())?.fireId || ''
        }));
      }
    }

    try {
      const moduleName = (formData.category === 'product') ? 'Order Management (Products)' : 'Order Management (Chocolates)';
      if (formData.fireId) {
        const previousOrder = orders.find(o => o.id === formData.id);
        const { fireId, ...dataToUpdate } = formattedOrder;

        // 🛠️ Automatic-a undefined error-a thadukkum code
        Object.keys(dataToUpdate).forEach(key => dataToUpdate[key] === undefined && delete dataToUpdate[key]);

        await updateDoc(doc(db, "orders", formData.fireId), dataToUpdate);
        // Fire-and-forget: logActivity is non-critical
        logActivity(`Edited Order: ${formData.name} (${formData.chocolate || 'Product'} x${formData.count})`, moduleName);
        toast.success("Order updated successfully!");

        // Track in local undo stack
        if (previousOrder) {
          undoStackRef.current.push({
            type: 'EDIT_ORDER',
            undo: async () => {
              const restored = { ...previousOrder };
              const fid = restored.fireId;
              delete restored.fireId;
              Object.keys(restored).forEach(key => restored[key] === undefined && delete restored[key]);
              await setDoc(doc(db, "orders", fid), restored);
              logActivity(`Restored Order: ${previousOrder.name} (${previousOrder.chocolate || 'Product'} x${previousOrder.count})`, moduleName);
            },
            redo: async () => {
              const updatedData = { ...formattedOrder };
              const fid = formData.fireId;
              delete (updatedData as any).fireId;
              Object.keys(updatedData).forEach(key => updatedData[key] === undefined && delete updatedData[key]);
              await setDoc(doc(db, "orders", fid), updatedData);
              logActivity(`Edited Order: ${formData.name} (${formData.chocolate || 'Product'} x${formData.count}) via Redo`, moduleName);
            }
          });
          redoStackRef.current = [];
        }
      } else {
        const nextId = await getNextSequentialOrderId(db, orders);
        formattedOrder.id = nextId;
        delete formattedOrder.fireId;

        // 🛠️ Automatic-a undefined error-a thadukkum code
        Object.keys(formattedOrder).forEach(key => formattedOrder[key] === undefined && delete formattedOrder[key]);

        const newDocRef = await addDoc(collection(db, "orders"), formattedOrder);
        // Fire-and-forget: logActivity is non-critical
        logActivity(`Added New Order: ${formData.name} (${formData.chocolate || 'Product'} x${formData.count})`, moduleName);
        toast.success("Order added successfully!");

        // Track in local undo stack
        undoStackRef.current.push({
          type: 'ADD_ORDER',
          undo: async () => {
            await deleteDoc(doc(db, "orders", newDocRef.id));
            logActivity(`Undid Action: Removed Added Order: ${formData.name}`, moduleName);
          },
          redo: async () => {
            const addedOrder = { ...formattedOrder };
            delete (addedOrder as any).fireId;
            Object.keys(addedOrder).forEach(key => addedOrder[key] === undefined && delete addedOrder[key]);
            await setDoc(doc(db, "orders", newDocRef.id), addedOrder);
            logActivity(`Added New Order: ${formData.name} (${formData.chocolate || 'Product'} x${formData.count}) via Redo`, moduleName);
          }
        });
        redoStackRef.current = [];
      }

      // Close modal and reset form immediately after main DB write
      setIsModalOpen(false);
      const today = new Date().toISOString().split('T')[0];
      setFormData({ id: null as any, fireId: null as any, name: "", phone: "", orderDate: today, functionDate: today, deliveryDate: today, chocolate: "", count: "", address: "", status: "In Process", paymentStatus: "Pending", discount: 0, isDeliveryFree: false, isChennai: false, orderType: getOrderTypeName(orderTypes[0]) || "Sabi", role: "Others", orderStatus: "image edited (not paid)", category: activeTab === 'dashboard2' ? 'product' : 'chocolate', manualDeliveryFee: "", advanceAmount: "", manualProductPrice: "", pricingType: 'retail' });

      // Fire-and-forget: Board card auto-move is non-critical
      if (formData.phone) {
        const normalizePhoneStr = (p: string) => {
          if (!p) return "";
          const digits = p.replace(/\D/g, '');
          return digits.length >= 10 ? digits.slice(-10) : digits;
        };
        const normInput = normalizePhoneStr(formData.phone);

        if (normInput) {
          const updatedLists = boardLists.map(l => ({ ...l, cards: [...l.cards] }));
          const printList = updatedLists.find(l => l.title.trim().toLowerCase() === 'forward to print');

          if (printList && printList.cards && printList.cards.length > 0) {
            const matchingCards = printList.cards.filter((c: any) => normalizePhoneStr(c.phoneNumber) === normInput);
            if (matchingCards.length > 0) {
              printList.cards = printList.cards.filter((c: any) => normalizePhoneStr(c.phoneNumber) !== normInput);
              const completedList = updatedLists.find(l => l.title.trim().toLowerCase() === 'order completed');
              const cardsToMove = matchingCards.map((c: any) => ({ ...c, status: 'Order Completed' }));

              if (completedList) {
                if (!completedList.cards) completedList.cards = [];
                completedList.cards.push(...cardsToMove);
              } else {
                if (!updatedLists[0].cards) updatedLists[0].cards = [];
                updatedLists[0].cards.push(...cardsToMove);
              }

              const boardDocRef = doc(db, 'daily_tasks_board', 'board_data');
              // Don't await — fire-and-forget
              setDoc(boardDocRef, { lists: updatedLists, updatedAt: new Date().toISOString() }, { merge: true }).catch(e => console.error('Board update error:', e));
            }
          }
        }
      }

    } catch (err) {
      console.error("Error saving:", err);
      toast.error("Failed to save order. Please check console.");
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleAddInventory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invForm.boxCount || !invForm.itemsPerBox) return alert("Please fill all fields");

    const entryData = {
      date: invForm.date,
      chocolate: invForm.chocolate,
      boxCount: Number(invForm.boxCount),
      itemsPerBox: Number(invForm.itemsPerBox),
      totalChocolates: Number(invForm.boxCount) * Number(invForm.itemsPerBox),
      type: "Purchase"
    };

    try {
      if (editInvId) {
        await updateDoc(doc(db, "inventory", editInvId), entryData);
        setInventoryLogs(prev => prev.map(log => log.fireId === editInvId ? { ...log, ...entryData } : log));
        setEditInvId(null);
        logActivity(`Edited Inventory: ${invForm.chocolate} (${invForm.boxCount} boxes x ${invForm.itemsPerBox})`, 'Inventories');
      } else {
        const fireId = Date.now().toString();
        setInventoryLogs(prev => [{ fireId, ...entryData, timestamp: Date.now() }, ...prev]);
        await addDoc(collection(db, "inventory"), {
          ...entryData,
          timestamp: Date.now()
        });
        logActivity(`Added Inventory: ${invForm.chocolate} (${invForm.boxCount} boxes x ${invForm.itemsPerBox} = ${Number(invForm.boxCount) * Number(invForm.itemsPerBox)} pcs)`, 'Inventories');
      }
      setInvForm(prev => ({ ...prev, boxCount: "", itemsPerBox: "" }));
      setIsInvModalOpen(false);
    } catch (err) { console.error(err); }
  };

  const handleDeleteInventory = async (fireId: string) => {
    if (window.confirm("Delete this inventory entry?")) {
      const log = inventoryLogs.find(l => l.fireId === fireId);
      setInventoryLogs(prev => prev.filter(log => log.fireId !== fireId));
      try {
        await deleteDoc(doc(db, "inventory", fireId));
        logActivity(`Deleted Inventory Entry: ${log?.chocolate || 'Unknown'}`, 'Inventories');
      } catch (e) { }
    }
  };

  const handleAddCustomProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProductForm.name || !newProductForm.price) return;
    try {
      setIsSavingProduct(true);
      let uploadedImageUrls: string[] = [];

      if (newProductImages.length > 0) {
        const toastId = toast.loading(`Uploading ${newProductImages.length} product image(s) to Cloudinary...`);
        try {
          uploadedImageUrls = await uploadMultipleToCloudinary(newProductImages);
          toast.success(`${uploadedImageUrls.length} image(s) uploaded to Cloudinary!`, { id: toastId });
        } catch (uploadErr: any) {
          toast.error(uploadErr?.message || "Cloudinary image upload failed", { id: toastId });
          setIsSavingProduct(false);
          return;
        }
      }

      const combinedImages = [...newProductExistingImages, ...uploadedImageUrls];
      const productType = newProductForm.productType || "Single product";

      const dataToSave = {
        name: newProductForm.name,
        price: Number(newProductForm.price),
        sellingPrice: Number(newProductForm.price),
        wholesalePrice: parseFloat(newProductForm.wholesalePrice) || 0,
        productType: productType,
        createdAt: new Date().toISOString(),
        images: combinedImages
      };

      if (editProductId) {
        await updateDoc(doc(db, "products", editProductId), {
          name: newProductForm.name,
          price: Number(newProductForm.price),
          sellingPrice: Number(newProductForm.price),
          wholesalePrice: parseFloat(newProductForm.wholesalePrice) || 0,
          productType: productType,
          images: combinedImages
        });
        toast.success("Listing updated successfully!");
        logActivity(`Edited Listing: ${newProductForm.name} [${productType}] (Selling: ₹${newProductForm.price}, Wholesale: ₹${newProductForm.wholesalePrice || 0})`, 'Products');
      } else {
        await addDoc(collection(db, "products"), dataToSave);
        toast.success("Product listing added successfully!");
        logActivity(`Added New Listing: ${newProductForm.name} [${productType}] (Selling: ₹${newProductForm.price}, Wholesale: ₹${newProductForm.wholesalePrice || 0})`, 'Products');
      }
      setIsAddProductModalOpen(false);
      setNewProductForm({ name: "", wholesalePrice: "", price: "", productType: "Single product" });
      setNewProductImages([]);
      setNewProductExistingImages([]);
      setEditProductId(null);
    } catch (err: any) {
      console.error("Error saving product:", err);
      toast.error(err?.message || "Error saving product.");
    } finally {
      setIsSavingProduct(false);
    }
  };

  const handleEditProductClick = (prod: any) => {
    setNewProductForm({ 
      name: prod.name, 
      wholesalePrice: String(prod.wholesalePrice !== undefined && prod.wholesalePrice !== null ? prod.wholesalePrice : ""), 
      price: String(prod.price ?? prod.sellingPrice ?? ""),
      productType: prod.productType || "Single product"
    });
    setNewProductExistingImages(prod.images || []);
    setNewProductImages([]);
    setEditProductId(prod.fireId);
    if (activeTab === 'products') {
      const formEl = document.getElementById("product-inline-form");
      if (formEl) {
        formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      setIsAddProductModalOpen(true);
    }
  };

  const handleDeleteProductClick = async (fireId: string) => {
    if (window.confirm("Are you sure you want to delete this product?")) {
      const prod = customProducts.find(p => p.fireId === fireId);
      if (prod) {
        try {
          const originalProdData = { ...prod };
          delete (originalProdData as any).fireId;

          await deleteDoc(doc(db, "products", fireId));
          logActivity(`Deleted Product: ${prod?.name || 'Unknown'}`, 'Products');
          toast.success("Product deleted successfully!");

          // Track in local undo stack
          undoStackRef.current.push({
            type: 'DELETE_PRODUCT',
            undo: async () => {
              await setDoc(doc(db, "products", fireId), originalProdData);
              logActivity(`Restored Product: ${prod?.name || 'Unknown'}`, 'Products');
            },
            redo: async () => {
              await deleteDoc(doc(db, "products", fireId));
              logActivity(`Deleted Product: ${prod?.name || 'Unknown'} via Redo`, 'Products');
            }
          });
          redoStackRef.current = [];
        } catch (e) {
          console.error("Failed to delete product:", e);
        }
      }
    }
  };

  const handleDeleteChocClick = async (choc: any) => {
    if (window.confirm(`Are you sure you want to delete chocolate "${choc.name}"?`)) {
      try {
        const fireId = choc.fireId;
        const originalChocData = { ...choc };
        delete (originalChocData as any).fireId;

        await deleteDoc(doc(db, "managed_chocolates", fireId));
        logActivity(`Deleted Chocolate: ${choc.name}`, 'Chocolates');
        toast.success("Chocolate deleted successfully!");

        // Track in local undo stack
        undoStackRef.current.push({
          type: 'DELETE_CHOCOLATE',
          undo: async () => {
            await setDoc(doc(db, "managed_chocolates", fireId), originalChocData);
            logActivity(`Restored Chocolate: ${choc.name}`, 'Chocolates');
          },
          redo: async () => {
            await deleteDoc(doc(db, "managed_chocolates", fireId));
            logActivity(`Deleted Chocolate: ${choc.name} via Redo`, 'Chocolates');
          }
        });
        redoStackRef.current = [];
      } catch (err) {
        console.error("Failed to delete chocolate:", err);
      }
    }
  };

  // --- DYNAMIC ORDER TYPES HANDLERS ---
  const handleAddOrderType = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newOrderTypeName.trim();
    if (!trimmed) return;

    // Check duplicate name (case-insensitive)
    const isDup = orderTypes.some(
      (ot, idx) => {
        const otId = getOrderTypeId(ot, idx);
        const otName = getOrderTypeName(ot);
        return otId !== editOrderTypeId && otName.toLowerCase() === trimmed.toLowerCase();
      }
    );
    if (isDup) {
      toast.error(`Order type "${trimmed}" already exists!`);
      return;
    }

    try {
      if (editOrderTypeId) {
        const prev = orderTypes.find((ot, idx) => getOrderTypeId(ot, idx) === editOrderTypeId);
        const prevName = getOrderTypeName(prev);
        if (editOrderTypeId.startsWith('default-') || editOrderTypeId.startsWith('ot-')) {
          const docRef = await addDoc(collection(db, "order_types"), {
            name: trimmed,
            createdAt: new Date().toISOString()
          });
          const updated = orderTypes.map((ot, idx) => getOrderTypeId(ot, idx) === editOrderTypeId ? { fireId: docRef.id, name: trimmed } : (typeof ot === 'string' ? { fireId: `default-${idx + 1}`, name: ot } : ot));
          setOrderTypes(updated);
          localStorage.setItem('sabi_order_types', JSON.stringify(updated));
        } else {
          await updateDoc(doc(db, "order_types", editOrderTypeId), { name: trimmed });
          const updated = orderTypes.map((ot, idx) => getOrderTypeId(ot, idx) === editOrderTypeId ? { ...ot, name: trimmed } : (typeof ot === 'string' ? { fireId: `default-${idx + 1}`, name: ot } : ot));
          setOrderTypes(updated);
          localStorage.setItem('sabi_order_types', JSON.stringify(updated));
        }
        toast.success(`Order type updated to "${trimmed}"!`);
        logActivity(`Edited Order Type: "${prevName || 'Unknown'}" -> "${trimmed}"`, 'Orders');
        setEditOrderTypeId(null);
      } else {
        const docRef = await addDoc(collection(db, "order_types"), {
          name: trimmed,
          createdAt: new Date().toISOString()
        });
        const cleanList = orderTypes.map((ot, idx) => typeof ot === 'string' ? { fireId: `default-${idx + 1}`, name: ot } : ot);
        const updated = [...cleanList, { fireId: docRef.id, name: trimmed }];
        setOrderTypes(updated);
        localStorage.setItem('sabi_order_types', JSON.stringify(updated));
        toast.success(`Added Order Type "${trimmed}"!`);
        logActivity(`Added Order Type: "${trimmed}"`, 'Orders');
      }
      setNewOrderTypeName("");
    } catch (err) {
      console.error("Failed to save order type:", err);
      // Fallback local update
      if (!editOrderTypeId) {
        const cleanList = orderTypes.map((ot, idx) => typeof ot === 'string' ? { fireId: `default-${idx + 1}`, name: ot } : ot);
        const updated = [...cleanList, { fireId: `local-${Date.now()}`, name: trimmed }];
        setOrderTypes(updated);
        localStorage.setItem('sabi_order_types', JSON.stringify(updated));
        toast.success(`Added Order Type "${trimmed}"!`);
      }
      setNewOrderTypeName("");
    }
  };

  const handleDeleteOrderType = async (otInput: any) => {
    if (orderTypes.length <= 1) {
      toast.error("At least one order type must remain in the system!");
      return;
    }
    const otName = getOrderTypeName(otInput);
    const otId = otInput?.fireId || getOrderTypeId(otInput, 0);

    if (window.confirm(`Are you sure you want to delete order type "${otName}"?`)) {
      // 1. Immediately update state and localStorage for instant feedback
      const updated = orderTypes.filter((item, idx) => {
        const iName = getOrderTypeName(item);
        const iId = getOrderTypeId(item, idx);
        return iName !== otName && iId !== otId;
      }).map((item, idx) => typeof item === 'string' ? { fireId: `default-${idx + 1}`, name: item } : item);
      setOrderTypes(updated);
      try {
        localStorage.setItem('sabi_order_types', JSON.stringify(updated));
      } catch (e) {}

      if (editOrderTypeId === otId || editOrderTypeId === otName) {
        setEditOrderTypeId(null);
        setNewOrderTypeName("");
      }

      // 2. Delete from Firestore if it's a real Firestore doc
      if (otId && !otId.startsWith('default-') && !otId.startsWith('local-') && !otId.startsWith('ot-')) {
        try {
          await deleteDoc(doc(db, "order_types", otId));
        } catch (err) {
          console.warn("Firestore delete order type note:", err);
        }
      }
      toast.success(`Deleted order type "${otName}"!`);
      logActivity(`Deleted Order Type: "${otName}"`, 'Orders');
    }
  };

  // --- FAST CLIENT-SIDE IMAGE COMPRESSION (50ms) FOR SUB-SECOND UPLOADS ---
  const compressImageForUpload = async (file: File): Promise<File | Blob> => {
    if (file.type === 'image/gif' || file.type === 'image/svg+xml') return file;
    if (file.size < 400 * 1024) return file; // Under 400KB doesn't need compression

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1800;
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(file);
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (blob && blob.size < file.size) {
              resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
            } else {
              resolve(file);
            }
          }, 'image/jpeg', 0.88);
        };
        img.onerror = () => resolve(file);
        img.src = e.target?.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    });
  };

  // --- PRODUCT IMAGE HANDLERS (⚡ INSTANT 1-SECOND OPTIMISTIC UI) ---
  const handleImageUpload = async (productFireId: string, files: FileList | File[]) => {
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const validFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (validTypes.includes(file.type)) {
        validFiles.push(file);
      }
    }

    if (validFiles.length === 0) {
      toast.error("Please select a JPG, PNG, or WEBP image.");
      return;
    }

    // ⚡ 1. INSTANT OPTIMISTIC PREVIEW (0ms: displays immediately in gallery)
    const localPreviews = validFiles.map(f => URL.createObjectURL(f));
    const product = customProducts.find(p => p.fireId === productFireId);
    const existingImages = product?.images || [];
    const optimisticImages = [...existingImages, ...localPreviews];

    // Immediately update gallery modal view
    if (imageGalleryProduct?.fireId === productFireId) {
      setImageGalleryProduct({ ...imageGalleryProduct, images: optimisticImages });
      setGalleryActiveIndex(optimisticImages.length - 1);
    }

    // Immediately update custom products list for table thumbnail
    setCustomProducts(prev => prev.map(p => p.fireId === productFireId ? { ...p, images: optimisticImages } : p));
    toast.success(`${validFiles.length} image(s) added!`, { duration: 1500 });

    // ⚡ 2. FAST BACKGROUND COMPRESSION & CLOUDINARY UPLOAD (< 1 second)
    try {
      const compressedFiles = await Promise.all(validFiles.map(f => compressImageForUpload(f)));
      const cloudinaryUrls = await uploadMultipleToCloudinary(compressedFiles as any);

      // Replace temporary previews with permanent Cloudinary URLs
      const finalImages = [...existingImages, ...cloudinaryUrls];

      // Save to Firestore permanently so refresh NEVER removes the images!
      await updateDoc(doc(db, "products", productFireId), { images: finalImages });

      // Update state with permanent URLs
      if (imageGalleryProduct?.fireId === productFireId) {
        setImageGalleryProduct({ ...imageGalleryProduct, images: finalImages });
      }
      setCustomProducts(prev => prev.map(p => p.fireId === productFireId ? { ...p, images: finalImages } : p));
    } catch (err: any) {
      console.error("Cloudinary upload background error:", err);
      // Fallback: save to Firestore as base64 so it persists on refresh even if network hiccup
      try {
        const base64List = await Promise.all(validFiles.map(f => {
          return new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = () => res(r.result as string);
            r.readAsDataURL(f);
          });
        }));
        const finalImages = [...existingImages, ...base64List];
        await updateDoc(doc(db, "products", productFireId), { images: finalImages });
        if (imageGalleryProduct?.fireId === productFireId) {
          setImageGalleryProduct({ ...imageGalleryProduct, images: finalImages });
        }
        setCustomProducts(prev => prev.map(p => p.fireId === productFireId ? { ...p, images: finalImages } : p));
      } catch (firestoreErr) {
        toast.error("Failed to save image to cloud database.");
      }
    }
  };

  // ⚡ INSTANT 0ms OPTIMISTIC DELETE
  const handleDeleteImage = async (productFireId: string, imageIndex: number) => {
    const product = customProducts.find(p => p.fireId === productFireId);
    if (!product || !product.images) return;
    const oldImages = [...product.images];
    const updatedImages = product.images.filter((_: any, i: number) => i !== imageIndex);

    // 1. Instant optimistic state update (0ms delay!)
    if (imageGalleryProduct?.fireId === productFireId) {
      setImageGalleryProduct({ ...imageGalleryProduct, images: updatedImages });
      if (galleryActiveIndex >= updatedImages.length) {
        setGalleryActiveIndex(Math.max(0, updatedImages.length - 1));
      }
    }
    setCustomProducts(prev => prev.map(p => p.fireId === productFireId ? { ...p, images: updatedImages } : p));
    setDeleteImageConfirm(null);
    toast.success("Image deleted", { duration: 1500 });

    // 2. Async save to Firestore in background
    try {
      await updateDoc(doc(db, "products", productFireId), { images: updatedImages });
    } catch (err) {
      console.error("Delete image error:", err);
      // Revert if failed
      if (imageGalleryProduct?.fireId === productFireId) {
        setImageGalleryProduct({ ...imageGalleryProduct, images: oldImages });
      }
      setCustomProducts(prev => prev.map(p => p.fireId === productFireId ? { ...p, images: oldImages } : p));
      toast.error("Failed to delete image from database.");
    }
  };

  // ⚡ INSTANT 0ms DOM COPY IMAGE
  const handleCopyImage = async (imageUrl: string) => {
    try {
      // 1. Try instant copy directly from decoded DOM Image (0ms, no network fetch!)
      const domImg = document.getElementById("gallery-main-image") as HTMLImageElement;
      if (domImg && domImg.complete && domImg.naturalWidth > 0) {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = domImg.naturalWidth;
          canvas.height = domImg.naturalHeight;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(domImg, 0, 0);
            const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, "image/png"));
            if (blob) {
              await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
              toast.success("Image copied to clipboard!");
              return;
            }
          }
        } catch (canvasErr) {
          // If tainted canvas due to cross-origin, fall through to fetch
        }
      }

      // 2. Fast fetch copy with caching
      const response = await fetch(imageUrl, { cache: 'force-cache' });
      const originalBlob = await response.blob();

      if (originalBlob.type === 'image/png') {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': originalBlob })
        ]);
        toast.success('Image copied to clipboard!');
      } else {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = imageUrl;
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No canvas context');
        ctx.drawImage(img, 0, 0);
        const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('Failed to create blob');
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        toast.success('Image copied to clipboard!');
      }
    } catch (err) {
      console.error('Copy image error:', err);
      // Fallback: copy image URL to clipboard
      try {
        await navigator.clipboard.writeText(imageUrl);
        toast.success('Image URL copied to clipboard!');
      } catch (clipboardErr) {
        toast.error('Failed to copy image.');
      }
    }
  };

  const handleExportExcel = async () => {
    try {
      const XLSX = await import("xlsx");
      const exportData = filteredDashboardOrders.map(order => {
        const priceData = calculatePriceInfo(order.chocolate, order.count, order.discount, order.isDeliveryFree, order.paymentStatus, order.category, customPricesMap, order.manualDeliveryFee, order.orderStatus, managedChocPricesMap, order.pricingType, order.manualProductPrice);

        return {
          "Order ID": getSerial(order.id),
          "Order Date": order.orderDate || order.functionDate,
          "Name": order.name,
          "Contact Number": formatPhoneNumber(order.phone),
          "Function Date": order.functionDate,
          "Dispatch Date": order.deliveryDate,
          "Chocolate Name": order.chocolate,
          "Count": order.count,
          "Chocolate Price": priceData.chocolatePrice,
          "Delivery Charge": order.isDeliveryFree ? 'Free' : priceData.deliveryCharge,
          "Discount": order.discount,
          "Total Price": priceData.totalPrice,
          "Payment": order.paymentStatus || "Pending",
          "Status": order.status
        };
      });

      if (exportData.length === 0) {
        toast.error("No Dashboard orders available to export.");
        return;
      }

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Orders");
      XLSX.writeFile(workbook, `Dashboard_Orders_${new Date().toISOString().split('T')[0]}.xlsx`);
      toast.success(`Successfully exported ${exportData.length} orders to Excel!`);
    } catch (err) {
      console.error("Dashboard Export Error:", err);
      toast.error("Failed to export Dashboard data to Excel.");
    }
  };

  const handleImportClick = () => { fileInputRef.current?.click(); };

  const handleFileImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error("Invalid file format. Please upload a valid Excel (.xlsx or .xls) file.");
      if (e.target) e.target.value = '';
      return;
    }

    try {
      const XLSX = await import("xlsx");
      const reader = new FileReader();

      reader.onload = async (event) => {
        try {
          const bstr = event.target?.result;
          const workbook = XLSX.read(bstr, { type: 'binary' });
          const worksheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[worksheetName];
          const data = XLSX.utils.sheet_to_json(worksheet);

          if (data && data.length > 0) {
            let importedCount = 0;
            for (const row of (data as any[])) {
              const rawName = row.Name || row.name || "";
              const rawPhone = row['Contact Number'] || row.Phone || row.phone || "";
              if (!rawName && !rawPhone) continue;

              const orderObj = {
                id: Date.now() + Math.random(),
                orderDate: formatToDisplayDate(row['Order Date'] || row.orderDate || row['Function Date'] || ""),
                name: String(rawName).trim(),
                phone: formatPhoneNumber(rawPhone),
                deliveryDate: formatToDisplayDate(row['Dispatch Date'] || row['Delivery Date'] || row.deliveryDate || row['Function Date'] || row.functionDate || row['Order Date'] || row.orderDate || ""),
                functionDate: formatToDisplayDate(row['Function Date'] || row.functionDate || row['Dispatch Date'] || row['Delivery Date'] || row.deliveryDate || ""),
                chocolate: String(row['Chocolate Name'] || row.Chocolate || row.chocolate || "").trim(),
                count: Number(row.Count || row.count) || 0,
                status: String(row.Status || row.status || "In Process").trim(),
                paymentStatus: String(row.Payment || row['Payment Status'] || row.paymentStatus || "Pending").trim(),
                address: String(row.Address || row.address || "").trim(),
                discount: Number(row.Discount || row.discount) || 0,
                isDeliveryFree: row['Delivery Charge'] === 'Free' || false,
                orderStatus: String(row['Order Status'] || row.orderStatus || "image edited (not paid)").trim(),
                category: String(row.Category || row.category || "chocolate").trim(),
                orderType: String(row['Order Type'] || row.orderType || "Thaaru").trim(),
                role: String(row.Role || row.role || (((row['Order Type'] || row.orderType) === 'Self') ? 'Self' : 'Others')).trim(),
                manualDeliveryFee: Number(row['Delivery Fee'] || row.manualDeliveryFee) || 0,
                advanceAmount: Number(row['Advance Amount'] || row.advanceAmount) || 0,
              };
              const priceData = calculatePriceInfo(orderObj.chocolate, orderObj.count, orderObj.discount, orderObj.isDeliveryFree, orderObj.paymentStatus, orderObj.category, customPricesMap, orderObj.manualDeliveryFee, orderObj.orderStatus, managedChocPricesMap, (orderObj as any).pricingType, (orderObj as any).manualProductPrice);
              const finalOrderObj = {
                ...orderObj,
                totalOrderPrice: priceData.fullTotalPrice || 0,
                itemSubtotal: priceData.fullChocolatePrice || 0,
                calculatedDeliveryFee: priceData.fullDeliveryCharge || 0
              };
              await addDoc(collection(db, "orders"), finalOrderObj);
              importedCount++;
            }
            if (importedCount > 0) {
              toast.success(`Successfully imported ${importedCount} orders to Dashboard!`);
            } else {
              toast.error("No valid order rows found in the uploaded file.");
            }
          } else {
            toast.error("The uploaded Excel file is empty or missing data.");
          }
        } catch (err) {
          console.error("Dashboard Import Error:", err);
          toast.error("Error parsing the Excel file contents. Ensure columns match the template.");
        }
      };

      reader.readAsBinaryString(file);
    } catch (err) {
      console.error("Dashboard Import Error:", err);
      toast.error("Error importing file.");
    }
    if (e.target) e.target.value = '';
  };


  const handleSendSMS = (order: any) => {
    const priceData = calculatePriceInfo(order.chocolate, order.count, order.discount, order.isDeliveryFree, order.paymentStatus, order.category, customPricesMap, order.manualDeliveryFee, order.orderStatus, managedChocPricesMap, order.pricingType, order.manualProductPrice);

    const qty = Number(order.count) || 0;
    const itemSubtotal = priceData.fullChocolatePrice;
    const deliveryAmt = priceData.fullDeliveryCharge;
    const totalAmt = priceData.fullTotalPrice;
    const unitPrice = priceData.unitPrice;

    const message = `Hello ${order.name},\nThank you for your order with SABI Return Gifts!\n\nOrder Details:\nItem: ${order.chocolate}\nQuantity: ${qty} (${qty} x ${unitPrice} = ${itemSubtotal}rs)\nDelivery Charge: ${deliveryAmt}rs\nTotal Amount: Rs.${totalAmt.toLocaleString()}\nDispatch Date: ${order.deliveryDate || order.functionDate || order.orderDate || '-'}\nPayment Status: ${order.paymentStatus || 'Pending'}\n\nThank you!`;
    const smsUrl = `sms:+91${order.phone}?body=${encodeURIComponent(message)}`;
    window.open(smsUrl, '_self');
  };

  const generateWhatsAppMessage = (order: any) => {
    const priceData = calculatePriceInfo(order.chocolate, order.count, order.discount, order.isDeliveryFree, order.paymentStatus, order.category, customPricesMap, order.manualDeliveryFee, order.orderStatus, managedChocPricesMap, order.pricingType, order.manualProductPrice);

    const qty = Number(order.count) || 0;
    const itemSubtotal = priceData.fullChocolatePrice;
    const deliveryAmt = priceData.fullDeliveryCharge;
    const totalAmt = priceData.fullTotalPrice;
    const unitPrice = priceData.unitPrice;

    let msg = `Hello ${order.name},\n\nThank you for your order with SABI Return Gifts!\n\nOrder Details:\nItem: ${order.chocolate}\nQuantity: ${qty} (${qty} x ${unitPrice} = ${itemSubtotal}rs)`;
    msg += `\nDelivery Charge: ${deliveryAmt}rs`;
    if ((Number(order.discount) || 0) > 0) {
      msg += `\nDiscount: -${Number(order.discount)}rs`;
    }
    msg += `\nTotal Amount: Rs.${totalAmt.toLocaleString()}`;
    msg += `\nDispatch Date: ${order.deliveryDate || order.functionDate || order.orderDate || '-'}`;
    msg += `\nPayment Status: ${order.paymentStatus || 'Pending'}`;
    msg += `\n\nThank you!`;
    return msg;
  };

  const handleWhatsAppClick = (order: any) => {
    setWhatsAppOrder(order);
    setWhatsAppMessage(generateWhatsAppMessage(order));
    setIsWhatsAppModalOpen(true);
  };


  const handleWhatsAppShare = () => {
    if (!whatsAppOrder) return;
    const phone = whatsAppOrder.phone.replace(/\D/g, '');
    const waUrl = `https://wa.me/91${phone}?text=${encodeURIComponent(whatsAppMessage)}`;
    window.open(waUrl, '_blank');
    setIsWhatsAppModalOpen(false);
  };


  const handleCapturePreview = async () => {
    const element = document.getElementById("preview-modal-content");
    if (element) {
      try {
        let html2canvasObj;
        try {
          const module = await import("html2canvas");
          html2canvasObj = module.default;
        } catch (err) {
          alert("Error: 'html2canvas' package is missing!\nPlease run 'npm install html2canvas' in your terminal.");
          return;
        }

        const canvas = await html2canvasObj(element, {
          backgroundColor: "#fffcf9",
          scale: 3,
          useCORS: true,
          windowWidth: 480,
          logging: false,
          allowTaint: true
        });

        canvas.toBlob(async (blob) => {
          if (blob) {
            let copied = false;
            try {
              if (navigator.clipboard && window.ClipboardItem) {
                const item = new ClipboardItem({ "image/png": blob });
                await navigator.clipboard.write([item]);
                copied = true;
                toast.success("✅ Receipt Copied to Clipboard!");
              }
            } catch (clipboardErr) {
              console.warn("Clipboard copy failed, fallback to automatic download:", clipboardErr);
            }

            if (!copied) {
              try {
                const link = document.createElement("a");
                link.download = `Receipt_${Date.now()}.png`;
                link.href = canvas.toDataURL("image/png");
                link.click();
                toast.success("✅ Receipt downloaded as PNG image!");
              } catch (dlErr) {
                toast.error("Failed to copy or download receipt image.");
              }
            }
          }
        }, "image/png");

      } catch (error) {
        console.error("Error generating receipt image:", error);
      }
    }
  };
  const handleDownloadShipping = async () => {
    const element = document.getElementById("shipping-label-content");
    if (element) {
      try {
        const html2canvas = (await import("html2canvas")).default;
        const canvas = await html2canvas(element, { backgroundColor: "#ffffff", scale: 3, useCORS: true });
        const dataUrl = canvas.toDataURL("image/jpeg", 1.0);
        const link = document.createElement("a");
        link.download = `Shipping_Label_${getSerial(shippingOrder.id)}.jpg`;
        link.href = dataUrl;
        link.click();
      } catch (err) {
        alert("Error downloading shipping label.");
      }
    }
  };

  // 📸 SCREENSHOT MODE: Multi-page chunked export (Max 20 orders per image page)
  const handleScreenshotCapture = async () => {
    const allOrdersToExport = sortedDashboardOrders;
    if (allOrdersToExport.length === 0) {
      toast.error("No orders to capture!");
      return;
    }

    setIsScreenshotMode(true);

    const CHUNK_SIZE = 20; // Compact vertical height (~20 orders per page)
    const totalPages = Math.ceil(allOrdersToExport.length / CHUNK_SIZE);
    
    toast.info(`📸 Exporting ${totalPages} Screenshot Image(s)...`);

    // Store previous scroll positions
    const container = tableContainerRef.current;
    const prevContainerScrollTop = container ? container.scrollTop : 0;
    const prevContainerScrollLeft = container ? container.scrollLeft : 0;
    const prevWindowY = window.scrollY;
    const prevWindowX = window.scrollX;

    if (container) {
      container.scrollTop = 0;
      container.scrollLeft = 0;
    }
    if (screenshotTableRef.current) {
      screenshotTableRef.current.scrollTop = 0;
      screenshotTableRef.current.scrollLeft = 0;
    }
    window.scrollTo(0, 0);

    const capturedBlobs: { blob: Blob; fileName: string; dataUrl: string }[] = [];

    try {
      const html2canvas = (await import("html2canvas")).default;

      for (let p = 0; p < totalPages; p++) {
        const startIdx = p * CHUNK_SIZE;
        const endIdx = Math.min((p + 1) * CHUNK_SIZE, allOrdersToExport.length);
        const chunk = allOrdersToExport.slice(startIdx, endIdx);

        setScreenshotChunkOrders(chunk);
        setScreenshotPageInfo({
          page: p + 1,
          totalPages,
          startNum: startIdx + 1,
          endNum: endIdx,
          totalOrders: allOrdersToExport.length
        });

        // Fast delay for DOM update & layout reflow
        await new Promise(resolve => setTimeout(resolve, 400));

        if (container) {
          container.scrollTop = 0;
          container.scrollLeft = 0;
        }
        if (screenshotTableRef.current) {
          screenshotTableRef.current.scrollTop = 0;
          screenshotTableRef.current.scrollLeft = 0;
        }
        window.scrollTo(0, 0);

        const element = screenshotTableRef.current;
        if (element) {
          const canvas = await html2canvas(element, {
            backgroundColor: "#0d1527",
            scale: 2,
            useCORS: true,
            logging: false,
            allowTaint: true,
            scrollX: 0,
            scrollY: 0,
            windowWidth: Math.max(element.scrollWidth, 1200),
            windowHeight: element.scrollHeight,
          });

          const dateStr = new Date().toISOString().slice(0, 10);
          const fileName = totalPages > 1 
            ? `Sabi_Order_Records_${dateStr}_Part${p + 1}_of_${totalPages}.png`
            : `Sabi_Order_Records_${dateStr}.png`;

          const dataUrl = canvas.toDataURL("image/png");

          await new Promise<void>((res) => {
            canvas.toBlob((blob) => {
              if (blob) {
                capturedBlobs.push({ blob, fileName, dataUrl });
              }
              res();
            }, "image/png");
          });
        }
      }

      // Download / Copy all captured page images
      if (capturedBlobs.length > 0) {
        let clipboardCopied = false;
        try {
          if (navigator.clipboard && window.ClipboardItem) {
            const clipboardItems = capturedBlobs.map(b => new ClipboardItem({ "image/png": b.blob }));
            await navigator.clipboard.write(clipboardItems);
            clipboardCopied = true;
          }
        } catch (clipErr) {
          console.warn("Clipboard write fallback:", clipErr);
        }

        // Trigger automatic downloads for each captured page image with 350ms delay
        for (let bIdx = 0; bIdx < capturedBlobs.length; bIdx++) {
          const item = capturedBlobs[bIdx];
          const link = document.createElement("a");
          link.download = item.fileName;
          link.href = item.dataUrl;
          link.click();
          if (capturedBlobs.length > 1) {
            await new Promise(res => setTimeout(res, 350));
          }
        }

        if (capturedBlobs.length > 1) {
          toast.success(`✅ Downloaded ${capturedBlobs.length} Separate Screenshot Images (${allOrdersToExport.length} Orders total)!`);
        } else if (clipboardCopied) {
          toast.success("✅ Table Screenshot Copied to Clipboard & Downloaded!");
        } else {
          toast.success("✅ Table Screenshot downloaded as PNG image!");
        }
      }
    } catch (error) {
      console.error("Error capturing multi-page screenshot:", error);
      toast.error("Failed to generate screenshot.");
    } finally {
      setIsScreenshotMode(false);
      setScreenshotChunkOrders([]);
      if (container) {
        container.scrollTop = prevContainerScrollTop;
        container.scrollLeft = prevContainerScrollLeft;
      }
      window.scrollTo(prevWindowX, prevWindowY);
    }
  };

  const renderChocolateBadges = (chocString: string) => {
    if (!chocString) return null;
    const items = String(chocString).split(',').map(c => c.trim()).filter(Boolean);
    return (
      <div className="flex flex-wrap gap-x-1 gap-y-0.5 justify-center items-center text-center">
        {items.map((c, i) => (
          <span key={i} className="chocolate-badge text-amber-300 font-extrabold text-sm whitespace-nowrap drop-shadow-sm">
            {c}{i < items.length - 1 ? ',' : ''}
          </span>
        ))}
      </div>
    );
  };

  const liveFormPrice = calculatePriceInfo(formData.chocolate, formData.count, formData.discount, formData.isDeliveryFree || formData.isChennai, formData.paymentStatus, formData.category, customPricesMap, formData.manualDeliveryFee, formData.orderStatus, managedChocPricesMap, formData.pricingType, formData.manualProductPrice);


  const profilePicUrl = "/logo.jpeg";

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regData.name || !regData.username || !regData.password) return alert("Fill all fields");
    try {
      await addDoc(collection(db, "employees"), {
        ...regData,
        status: 'Pending',
        createdAt: new Date().toISOString()
      });
      logActivity(`Registered New Employee: ${regData.name} (@${regData.username})`, 'Employees');
      alert("Registration Request Sent! Account must be approved before login.");
      setShowRegisterModal(false);
      setRegData({ name: "", username: "", password: "" });
    } catch (err) { alert("Error connecting to Database!"); }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn) return;

    const inputUser = username.trim().toLowerCase();
    const inputPass = password.trim();

    // 🛠️ FIX: "Subash G" ku bathila "subash g" nu mathunga
    if (inputUser === "subash g" && inputPass === "561997") {
      setIsLoggingIn(true);
      setTimeout(() => {
        setRole('Admin');
        setLoggedInName('Subash');
        setIsLoggedIn(true);
        setActiveTab('dashboard1');
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('loggedInName', 'Subash');
        localStorage.setItem('role', 'Admin');
        localStorage.setItem('loginTimestamp', Date.now().toString());
        setLoginError("");
        setIsLoggingIn(false);
      }, 2000);
      return;
    }

    const emp = employees.find(
      (emp) => emp.username.toLowerCase() === inputUser && emp.password === inputPass
    );

    if (emp) {
      if (emp.status === 'Approved') {
        setIsLoggingIn(true);
        updateDoc(doc(db, "employees", emp.fireId), {
          isLive: true,
          lastLoginAt: new Date().toISOString()
        }).catch(err => console.error("Error setting live status:", err));

        setTimeout(() => {
          setRole('Employee');
          setLoggedInName(emp.name);
          setEmployeeId(emp.fireId);
          setIsLoggedIn(true);
          setActiveTab('dashboard1');
          localStorage.setItem('isLoggedIn', 'true');
          localStorage.setItem('loggedInName', emp.name);
          localStorage.setItem('role', 'Employee');
          localStorage.setItem('employeeId', emp.fireId);
          localStorage.setItem('loginTimestamp', Date.now().toString());
          setLoginError("");
          setIsLoggingIn(false);
        }, 2000);
      } else {
        setLoginError("Your account is still pending approval or declined.");
      }
    } else {
      setLoginError("Invalid Username or Password!");
    }
  };

  const handleLogout = () => {
    const storedEmpId = localStorage.getItem('employeeId');
    const storedRole = localStorage.getItem('role');
    if (storedRole === 'Employee' && storedEmpId) {
      updateDoc(doc(db, "employees", storedEmpId), {
        isLive: false
      }).catch(err => console.error("Error revoking live status:", err));
    }

    if (supabaseSignOut) {
      supabaseSignOut().catch(err => console.error("Supabase signOut error:", err));
    }

    setIsLoggedIn(false);
    setUsername("");
    setPassword("");
    setLoggedInName("");
    setEmployeeId("");
    setAttendanceWallpaper("");
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('loggedInName');
    localStorage.removeItem('role');
    localStorage.removeItem('employeeId');
    localStorage.removeItem('loginTimestamp');
  };

  // Auto-logout after 24 hours of login (both Admin and Employee)
  useEffect(() => {
    if (!isLoggedIn) return;

    const checkSession = () => {
      const loginTime = localStorage.getItem('loginTimestamp');
      if (!loginTime) {
        localStorage.setItem('loginTimestamp', Date.now().toString());
        return;
      }
      const diff = Date.now() - Number(loginTime);
      const limit = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
      if (diff >= limit) {
        handleLogout();
      }
    };

    checkSession();
    const interval = setInterval(checkSession, 10000); // Check session timeout every 10 seconds

    return () => clearInterval(interval);
  }, [isLoggedIn]);

  if (isLoggingIn) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#2d1b14] relative overflow-hidden">
        {/* Decorative background radial gradient */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#5e3827] via-[#2d1b14] to-[#1a0f0b] opacity-80 animate-pulse" style={{ animationDuration: '6s' }}></div>

        {/* Animated ambient light spots */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#8b5a3e] rounded-full blur-[120px] opacity-20 animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#7c4d36] rounded-full blur-[120px] opacity-20 animate-pulse" style={{ animationDelay: '1s' }}></div>

        <div className="relative z-10 w-full max-w-sm flex flex-col items-center p-8 text-center">
          {/* Logo container with animated glow and pulse border */}
          <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
            {/* Spinning/glowing gradient border */}
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#8b5a3e] via-[#e8dccb] to-[#4a2c1d] animate-spin" style={{ animationDuration: '3s' }}></div>
            {/* Outer pulse */}
            <div className="absolute -inset-2 rounded-full border border-amber-500/20 animate-ping" style={{ animationDuration: '2s' }}></div>
            {/* Inner mask to keep image circular */}
            <div className="absolute inset-[4px] rounded-full overflow-hidden bg-[#2d1b14] border-4 border-[#2d1b14]">
              <img
                src="/logo.jpeg"
                alt="Logo"
                className="w-full h-full object-cover select-none"
                onError={(e) => {
                  // Fallback icon if logo fails to load
                  e.currentTarget.style.display = 'none';
                  const fb = e.currentTarget.parentElement?.querySelector('.fallback-icon');
                  if (fb) fb.classList.remove('hidden');
                }}
              />
              <div className="fallback-icon hidden w-full h-full flex items-center justify-center bg-[#4a2c1d] text-amber-100">
                <span className="text-3xl font-black">RC</span>
              </div>
            </div>
          </div>

          {/* SaaS-style loading text and dynamic progress */}
          <div className="space-y-4 w-full">
            <h3 className="text-xl font-bold text-amber-100 tracking-wider animate-pulse">
              Authenticating...
            </h3>

            {/* Continuous loading bar */}
            <div className="w-48 h-1.5 bg-[#4a2c1d]/50 rounded-full overflow-hidden mx-auto border border-[#8b5a3e]/20 relative">
              <div className="absolute top-0 bottom-0 left-0 w-1/2 bg-gradient-to-r from-[#8b5a3e] to-[#e8dccb] rounded-full animate-loading-bar"></div>
            </div>

            <p className="text-sm font-semibold text-[#a8826d] tracking-widest uppercase animate-pulse">
              loading
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <Login 
        onLoginSuccess={(userData) => {
          setIsLoggedIn(true);
          if (userData?.role) setRole(userData.role);
          if (userData?.name) setLoggedInName(userData.name);
          if (userData?.employeeId) setEmployeeId(userData.employeeId);
          setActiveTab('dashboard1');
        }} 
      />
    );
  }

  return (
    <div className={`flex h-[100dvh] min-h-[100dvh] w-full max-w-[100vw] overflow-x-hidden font-sans bg-[#0b1329] text-slate-100 relative ${isExportPreviewOpen || isReportPreviewOpen ? 'print:hidden' : ''} ${isWallpaperActive ? 'wallpaper-active' : ''}`}>

      <datalist id="discount-suggestions">
        <option value="0" />
        <option value="50" />
        <option value="100" />
        <option value="150" />
        <option value="200" />
        <option value="500" />
      </datalist>

      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-20 lg:hidden print:hidden backdrop-blur-xs" onClick={() => setIsSidebarOpen(false)} />
      )}

      <aside className={`bg-[#1c2230] border-r border-slate-800 transition-all duration-300 ease-in-out print:hidden flex-shrink-0 absolute lg:relative z-30 h-full overflow-hidden ${isSidebarOpen ? 'w-56' : 'w-0'}`}>
        <div className="w-56 h-full flex flex-col justify-between">
          <div className="overflow-y-auto flex-1 select-none">
            <div className={`p-6 flex flex-col items-center border-b border-slate-700/60 relative`}>
              <button onClick={() => setIsSidebarOpen(false)} className="absolute top-4 right-4 lg:hidden p-1 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg">
                <X size={20} />
              </button>
              <div className="relative w-20 h-20 mb-3 rounded-full p-1 bg-gradient-to-br from-blue-400 via-blue-600 to-indigo-800 shadow-[0_0_15px_rgba(59,130,246,0.8)] flex items-center justify-center">
                <div className="w-full h-full rounded-full border-[3px] border-white overflow-hidden bg-slate-900 shadow-inner">
                  <img src={profilePicUrl} alt="Profile" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
                </div>
              </div>

              <h2 className={`font-extrabold text-2xl text-white tracking-wide`} style={{ textShadow: "0 2px 4px rgba(0,0,0,0.4)" }}>
                {loggedInName}
              </h2>

              {role === 'Admin' && (
                <span className={`text-xs text-white font-black px-4 py-1 rounded-full mt-2 border border-blue-400 bg-gradient-to-r from-blue-500 to-blue-700 shadow-sm`}>
                  Admin
                </span>
              )}
            </div>

            <nav className="p-4 space-y-2.5 mt-3">
              <button
                onClick={() => { setActiveTab('dashboard1'); setShowSidebarHighlight(true); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${showSidebarHighlight && activeTab === 'dashboard1' ? 'bg-[#292e42] border border-blue-500/50 border-l-4 border-l-blue-500 text-white font-extrabold shadow-lg shadow-indigo-950/50 scale-[1.02]' : 'bg-[#2a303c] hover:bg-[#343c4b] text-slate-100 hover:text-white border border-slate-700/50 font-bold'}`}>
                <Home size={18} className={showSidebarHighlight && activeTab === 'dashboard1' ? 'text-blue-400 drop-shadow-md' : 'text-slate-300'} />
                <span>Dashboard 1</span>
              </button>

              <button
                onClick={() => { setActiveTab('daily_tasks'); setShowSidebarHighlight(true); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${showSidebarHighlight && activeTab === 'daily_tasks' ? 'bg-[#292e42] border border-blue-500/50 border-l-4 border-l-blue-500 text-white font-extrabold shadow-lg shadow-indigo-950/50 scale-[1.02]' : 'bg-[#2a303c] hover:bg-[#343c4b] text-slate-100 hover:text-white border border-slate-700/50 font-bold'}`}>
                <ClipboardList size={18} className={showSidebarHighlight && activeTab === 'daily_tasks' ? 'text-blue-400 drop-shadow-md' : 'text-slate-300'} />
                <span>Daily Tasks</span>
              </button>

              <button
                onClick={() => { setActiveTab('dashboard2'); setShowSidebarHighlight(true); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${showSidebarHighlight && activeTab === 'dashboard2' ? 'bg-[#292e42] border border-blue-500/50 border-l-4 border-l-blue-500 text-white font-extrabold shadow-lg shadow-indigo-950/50 scale-[1.02]' : 'bg-[#2a303c] hover:bg-[#343c4b] text-slate-100 hover:text-white border border-slate-700/50 font-bold'}`}>
                <Package size={18} className={showSidebarHighlight && activeTab === 'dashboard2' ? 'text-blue-400 drop-shadow-md' : 'text-slate-300'} />
                <span>Dashboard 2</span>
              </button>

              {/* Products Section directly under Dashboard 2 */}
              <button
                onClick={() => { setActiveTab('products'); setShowSidebarHighlight(true); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${showSidebarHighlight && activeTab === 'products' ? 'bg-[#292e42] border border-blue-500/50 border-l-4 border-l-blue-500 text-white font-extrabold shadow-lg shadow-indigo-950/50 scale-[1.02]' : 'bg-[#2a303c] hover:bg-[#343c4b] text-slate-100 hover:text-white border border-slate-700/50 font-bold'}`}>
                <ShoppingBag size={18} className={showSidebarHighlight && activeTab === 'products' ? 'text-blue-400 drop-shadow-md' : 'text-slate-300'} />
                <span>Products</span>
              </button>

              <button
                onClick={() => { setActiveTab('inventories'); setShowSidebarHighlight(true); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${showSidebarHighlight && activeTab === 'inventories' ? 'bg-[#292e42] border border-blue-500/50 border-l-4 border-l-blue-500 text-white font-extrabold shadow-lg shadow-indigo-950/50 scale-[1.02]' : 'bg-[#2a303c] hover:bg-[#343c4b] text-slate-100 hover:text-white border border-slate-700/50 font-bold'}`}>
                <Archive size={18} className={showSidebarHighlight && activeTab === 'inventories' ? 'text-blue-400 drop-shadow-md' : 'text-slate-300'} />
                <span>Inventories</span>
              </button>

              <button
                onClick={() => {
                  setIsReportsAuthModalOpen(true);
                  setReportsPassword("");
                  setReportsAuthError("");
                  if (window.innerWidth < 1024) setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${showSidebarHighlight && activeTab === 'reports' ? 'bg-[#292e42] border border-blue-500/50 border-l-4 border-l-blue-500 text-white font-extrabold shadow-lg shadow-indigo-950/50 scale-[1.02]' : 'bg-[#2a303c] hover:bg-[#343c4b] text-slate-100 hover:text-white border border-slate-700/50 font-bold'}`}>
                <TrendingUp size={18} className={showSidebarHighlight && activeTab === 'reports' ? 'text-blue-400 drop-shadow-md' : 'text-slate-300'} />
                <span>Reports</span>
              </button>

              <button
                onClick={() => { setActiveTab('attendance'); setShowSidebarHighlight(true); if (window.innerWidth < 1024) setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${showSidebarHighlight && activeTab === 'attendance' ? 'bg-[#292e42] border border-blue-500/50 border-l-4 border-l-blue-500 text-white font-extrabold shadow-lg shadow-indigo-950/50 scale-[1.02]' : 'bg-[#2a303c] hover:bg-[#343c4b] text-slate-100 hover:text-white border border-slate-700/50 font-bold'}`}>
                <Calendar size={18} className={showSidebarHighlight && activeTab === 'attendance' ? 'text-blue-400 drop-shadow-md' : 'text-slate-300'} />
                <span>Attendance Log</span>
              </button>

            </nav>
          </div>

          <div className="p-4 border-t border-slate-700/60 space-y-2">
            <button
              onClick={() => {
                setIsHistoryAuthModalOpen(true);
                setHistoryPassword("");
                setHistoryAuthError("");
                if (window.innerWidth < 1024) setIsSidebarOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl text-purple-200 bg-[#2b274c] hover:bg-[#383363] hover:text-white border border-purple-500/40 hover:shadow-md active:scale-95 font-bold transition-all duration-300 shadow-sm cursor-pointer"
            >
              <History size={18} /> History
            </button>
            <button
              onClick={() => {
                setIsTrashOpen(true);
                if (window.innerWidth < 1024) setIsSidebarOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl text-amber-200 bg-[#3a3028] hover:bg-[#4a3e33] hover:text-white border border-amber-500/40 hover:shadow-md active:scale-95 font-bold transition-all duration-300 shadow-sm cursor-pointer"
            >
              <Trash2 size={18} /> Trash Bin
            </button>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl text-rose-200 bg-[#3d232a] hover:bg-[#522935] hover:text-white border border-rose-500/40 hover:shadow-md active:scale-95 font-black transition-all duration-300 shadow-sm cursor-pointer"
            >
              <Power size={18} /> Logout
            </button>
          </div>
        </div>
      </aside>

      <main
        className="flex-1 flex flex-col h-full w-full overflow-hidden print:overflow-visible shadow-[inset_0_5px_20px_rgba(0,0,0,0.6)] transition-all duration-500 relative"
        style={{
          backgroundImage: activeTab === 'daily_tasks' && dailyTasksWallpaper
            ? `linear-gradient(rgba(15, 23, 42, 0.45), rgba(15, 23, 42, 0.45)), ${dailyTasksWallpaper.startsWith('data:image') || dailyTasksWallpaper.startsWith('http') ? `url(${dailyTasksWallpaper})` : dailyTasksWallpaper
            }`
            : activeTab === 'daily_tasks'
              ? 'linear-gradient(to bottom right, #0f172a, #1e3a5f, rgba(96, 165, 250, 0.3))'
              : activeTab === 'dashboard1' && d1Wallpaper
                ? `linear-gradient(rgba(15, 23, 42, 0.45), rgba(15, 23, 42, 0.45)), ${d1Wallpaper.startsWith('data:image') || d1Wallpaper.startsWith('http') ? `url(${d1Wallpaper})` : d1Wallpaper
                }`
                : activeTab === 'dashboard2' && d2Wallpaper
                  ? `linear-gradient(rgba(15, 23, 42, 0.45), rgba(15, 23, 42, 0.45)), ${d2Wallpaper.startsWith('data:image') || d2Wallpaper.startsWith('http') ? `url(${d2Wallpaper})` : d2Wallpaper
                  }`
                  : activeTab === 'inventories' && invWallpaper
                    ? `linear-gradient(rgba(15, 23, 42, 0.45), rgba(15, 23, 42, 0.45)), ${invWallpaper.startsWith('data:image') || invWallpaper.startsWith('http') ? `url(${invWallpaper})` : invWallpaper
                    }`
                    : activeTab === 'tracking' && trackWallpaper
                      ? `linear-gradient(rgba(15, 23, 42, 0.45), rgba(15, 23, 42, 0.45)), ${trackWallpaper.startsWith('data:image') || trackWallpaper.startsWith('http') ? `url(${trackWallpaper})` : trackWallpaper
                      }`
                      : activeTab === 'reports' && reportsWallpaper
                        ? `linear-gradient(rgba(15, 23, 42, 0.45), rgba(15, 23, 42, 0.45)), ${reportsWallpaper.startsWith('data:image') || reportsWallpaper.startsWith('http') ? `url(${reportsWallpaper})` : reportsWallpaper
                        }`
                        : activeTab === 'attendance' && attendanceWallpaper
                          ? `linear-gradient(rgba(15, 23, 42, 0.45), rgba(15, 23, 42, 0.45)), ${attendanceWallpaper.startsWith('data:image') || attendanceWallpaper.startsWith('http') ? `url(${attendanceWallpaper})` : attendanceWallpaper
                          }`
                          : 'linear-gradient(to bottom right, #080d19, #0d1527, #101c36)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'scroll'
        }}
      >

        {!showHeader && (
          <div className="absolute top-4 left-4 z-50 flex items-center gap-2 print:hidden">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 text-blue-200 bg-[#19233b] hover:bg-[#233152] rounded-lg shadow-md transition-colors border border-blue-800/60 cursor-pointer flex items-center justify-center"
              title="Toggle Menu"
            >
              <Menu size={18} />
            </button>
            <button
              onClick={() => setShowHeader(true)}
              className="px-3 py-2 text-xs font-bold text-blue-200 bg-[#19233b] hover:bg-[#233152] rounded-lg shadow-md transition-colors border border-blue-800/60 cursor-pointer flex items-center gap-1.5"
              title="Show Header"
            >
              <Eye size={14} className="text-blue-400" /> Show Header
            </button>
          </div>
        )}

        {showHeader && (
          <header className="bg-[#0e1628] border-b border-blue-900/50 px-3 sm:px-5 md:px-6 py-2.5 sm:py-3 flex justify-between items-center shadow-md relative z-50 print:hidden gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
            <div className="flex items-center gap-2 sm:gap-3 md:gap-5 min-w-0">
              <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-blue-200 bg-[#19233b] hover:bg-[#233152] rounded-lg transition-colors border border-blue-800/60 shrink-0 cursor-pointer" title="Toggle Menu">
                <Menu size={22} />
              </button>
              <button onClick={() => setShowHeader(false)} className="p-2 text-blue-200 bg-[#19233b] hover:bg-[#233152] rounded-lg transition-colors border border-blue-800/60 shrink-0 cursor-pointer" title="Hide Header">
                <EyeOff size={22} />
              </button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-xl md:text-2xl lg:text-3xl font-black text-white truncate max-w-[200px] sm:max-w-md lg:max-w-none">
                  {activeTab === 'dashboard1' && 'Order Management (Chocolates)'}
                  {activeTab === 'dashboard2' && 'Order Management (Products)'}
                  {activeTab === 'products' && 'Products Management'}
                  {activeTab === 'tracking' && 'Orders Tracking Center'}
                  {activeTab === 'reports' && 'Analytics & Reports'}
                  {activeTab === 'inventories' && 'Inventory Management'}
                  {activeTab === 'daily_tasks' && 'Daily Task Management Board'}
                  {activeTab === 'random_picker' && 'Monthly Winner Picker'}
                </h1>
                <p className="hidden md:block text-xs sm:text-sm text-blue-300 font-medium truncate">
                  {(activeTab === 'dashboard1' || activeTab === 'dashboard2') && 'Track your deliveries and statuses securely.'}
                  {activeTab === 'products' && 'Manage all products, selling prices, wholesale costs, and profit margins.'}
                  {activeTab === 'tracking' && 'Search and trace live order statuses.'}
                  {activeTab === 'reports' && 'View your sales and item statistics.'}
                  {activeTab === 'inventories' && 'Track live chocolate stock & manual entries.'}
                  {activeTab === 'daily_tasks' && 'Track your daily operations, follow-ups, and customer pipeline.'}
                  {activeTab === 'random_picker' && 'Draw monthly random winners for cashback rewards (Instagram Reels ready).'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-4 shrink-0">
              <div className="hidden sm:block text-right">
                <p className="text-xl sm:text-2xl font-black text-white tracking-wide uppercase leading-none">Sabi</p>
                <p className="text-xs font-bold text-blue-400 tracking-widest uppercase">return Gifts</p>
              </div>
              <div
                className="w-10 h-10 sm:w-14 sm:h-14 rounded-full p-0.5 sm:p-1 bg-gradient-to-br from-blue-400 via-blue-600 to-indigo-800 shadow-md flex items-center justify-center select-none shrink-0"
              >
                <div className="w-full h-full rounded-full border sm:border-2 border-white overflow-hidden bg-slate-900 shadow-inner">
                  <img src={profilePicUrl} alt="Profile" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
                </div>
              </div>
            </div>
          </header>
        )}

        <div className={`flex-1 ${(activeTab === 'dashboard1' || activeTab === 'dashboard2')
            ? 'laptop-dashboard-scroll'
            : 'overflow-y-auto'
          } custom-scrollbar p-2 sm:p-3 md:p-4 print:p-0 print:overflow-visible`}>

          {activeTab === 'daily_tasks' && (
            <div className="w-full h-full animate-in fade-in duration-300">
              <DailyTasksBoard
                onWallpaperChange={() => {
                  setDailyTasksWallpaper(localStorage.getItem('sabi_daily_tasks_wallpaper') || "");
                }}
              />
            </div>
          )}

          {/* ================= PRODUCTS MANAGEMENT SECTION ================= */}
          {activeTab === 'products' && (
            <div className="space-y-8 print:hidden animate-in fade-in duration-300 pb-12">
              
              {/* Top Control Header Card */}
              <div className="bg-[#0d1527] p-5 md:p-6 rounded-3xl shadow-2xl border border-white/15 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-lg shadow-blue-900/50 shrink-0">
                    <ShoppingBag size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-2">
                      Products Management & Inventory
                    </h2>
                    <p className="text-xs md:text-sm text-slate-300 font-medium">
                      Create new listings, track wholesale costs, selling prices, and real-time profit margins.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Top Section Product Type Filter Dropdown */}
                  <div className="flex items-center gap-2 bg-[#162035] border border-white/15 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 shadow-inner">
                    <Filter size={14} className="text-amber-400 shrink-0" />
                    <span className="text-slate-400 text-xs hidden xs:inline">Type:</span>
                    <div className="relative">
                      <select
                        aria-label="Filter products by type"
                        value={productTypeFilter}
                        onChange={(e) => setProductTypeFilter(e.target.value)}
                        className="bg-transparent text-xs font-bold text-white outline-none cursor-pointer pr-5 appearance-none focus:text-amber-300"
                      >
                        <option value="all" className="bg-[#162035] text-white">All Products ({orderedProducts.length})</option>
                        <option value="Single product" className="bg-[#162035] text-cyan-300">Single Products ({singleProductsCount})</option>
                        <option value="Combo set" className="bg-[#162035] text-purple-300">Combo Sets ({comboSetsCount})</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-slate-400">
                        <ChevronDown size={12} />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 bg-[#162035] border border-white/10 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-300">
                    <Package size={16} className="text-blue-400" />
                    <span>Total Items: <strong className="text-white text-sm">{orderedProducts.length}</strong></span>
                  </div>
                </div>
              </div>

              {/* 🟢 INLINE "ADD NEW LISTING" FORM (Directly on Page - NO POPUP MODAL) */}
              <div id="product-inline-form" className="bg-[#0c1427] border border-white/15 rounded-[2rem] p-6 md:p-8 max-w-xl mx-auto shadow-2xl text-white">
                <div className="flex items-center justify-between border-b border-white/15 pb-4 mb-6">
                  <h3 className="text-xl md:text-2xl font-black text-white uppercase tracking-wider">
                    {editProductId ? "Edit Listing" : "Add New Listing"}
                  </h3>
                  {editProductId && (
                    <span className="text-xs bg-amber-500/20 text-amber-300 border border-amber-400/50 px-3 py-1 rounded-full font-bold">
                      Editing Mode
                    </span>
                  )}
                </div>

                <form onSubmit={handleAddCustomProduct} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold mb-1.5 text-slate-300 uppercase tracking-wider">
                        Item Name
                      </label>
                      <input
                        required
                        type="text"
                        value={newProductForm.name}
                        onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
                        style={{ backgroundColor: '#151f36', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                        className="w-full font-bold rounded-xl p-3 outline-none border focus:border-amber-400 text-white placeholder-slate-400 shadow-inner text-sm"
                        placeholder="Enter Item Name (e.g. Munch)"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold mb-1.5 text-slate-300 uppercase tracking-wider">
                        Product Type
                      </label>
                      <div className="relative">
                        <select
                          value={newProductForm.productType || "Single product"}
                          onChange={(e) => setNewProductForm({ ...newProductForm, productType: e.target.value })}
                          style={{ backgroundColor: '#151f36', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                          className="w-full font-bold rounded-xl p-3 outline-none border focus:border-amber-400 text-white shadow-inner text-sm cursor-pointer appearance-none pr-9"
                        >
                          <option value="Single product" className="bg-[#151f36] text-white">Single product</option>
                          <option value="Combo set" className="bg-[#151f36] text-white">Combo set</option>
                        </select>
                        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                          <ChevronDown size={16} />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:gap-4">
                    <div>
                      <label className="block text-xs font-bold mb-1.5 text-slate-300 uppercase tracking-wider">
                        Wholesale Price
                      </label>
                      <input
                        required
                        type="number"
                        step="any"
                        value={newProductForm.wholesalePrice}
                        onChange={(e) => setNewProductForm({ ...newProductForm, wholesalePrice: e.target.value })}
                        style={{ backgroundColor: '#151f36', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                        className="w-full font-bold rounded-xl p-3 outline-none border focus:border-amber-400 text-white placeholder-slate-400 shadow-inner text-sm"
                        placeholder="Wholesale Price"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold mb-1.5 text-slate-300 uppercase tracking-wider">
                        Selling Price
                      </label>
                      <input
                        required
                        type="number"
                        step="any"
                        value={newProductForm.price}
                        onChange={(e) => setNewProductForm({ ...newProductForm, price: e.target.value })}
                        style={{ backgroundColor: '#151f36', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                        className="w-full font-bold rounded-xl p-3 outline-none border focus:border-amber-400 text-white placeholder-slate-400 shadow-inner text-sm"
                        placeholder="Selling Price"
                      />
                    </div>
                  </div>

                  {/* 📷 Product Images Uploader (Cloudinary) */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Camera size={13} className="text-amber-400" />
                        <span>Product Photos (Saved to Cloudinary)</span>
                      </span>
                      <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                    </label>

                    {/* Previews of Existing & Selected Images */}
                    {(newProductExistingImages.length > 0 || newProductImages.length > 0) && (
                      <div className="flex flex-wrap gap-2 p-2.5 bg-[#121b2f] rounded-xl border border-white/10">
                        {/* Saved Cloudinary Images */}
                        {newProductExistingImages.map((imgUrl, idx) => (
                          <div key={`existing-${idx}`} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-white/20 shadow-sm">
                            <img src={imgUrl} alt="Product" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setNewProductExistingImages(prev => prev.filter((_, i) => i !== idx))}
                              className="absolute top-0.5 right-0.5 bg-rose-600/90 hover:bg-rose-600 text-white rounded-full p-0.5 cursor-pointer opacity-80 group-hover:opacity-100 transition-opacity"
                              title="Remove image"
                            >
                              <X size={10} />
                            </button>
                            <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[8px] text-center text-slate-300 font-bold">Saved</span>
                          </div>
                        ))}

                        {/* Selected New Images to Upload */}
                        {newProductImages.map((file, idx) => (
                          <div key={`new-${idx}`} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-emerald-400/50 shadow-sm">
                            <img src={URL.createObjectURL(file)} alt="New upload" className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setNewProductImages(prev => prev.filter((_, i) => i !== idx))}
                              className="absolute top-0.5 right-0.5 bg-rose-600/90 hover:bg-rose-600 text-white rounded-full p-0.5 cursor-pointer opacity-80 group-hover:opacity-100 transition-opacity"
                              title="Remove image"
                            >
                              <X size={10} />
                            </button>
                            <span className="absolute bottom-0 inset-x-0 bg-emerald-600/90 text-[8px] text-center text-white font-bold">Ready</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <label className="flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-white/20 hover:border-amber-400/60 bg-[#151f36]/60 hover:bg-[#151f36] cursor-pointer transition-all text-xs font-bold text-slate-300 hover:text-white">
                      <Upload size={15} className="text-amber-400" />
                      <span>Click to select product photos</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            const selected = Array.from(e.target.files);
                            setNewProductImages(prev => [...prev, ...selected]);
                          }
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>

                  {/* Dynamic Real-time Profit Indicator inside the Form */}
                  {(newProductForm.price || newProductForm.wholesalePrice) && (() => {
                    const sp = Number(newProductForm.price) || 0;
                    const wp = Number(newProductForm.wholesalePrice) || 0;
                    const profit = sp - wp;
                    const marginPct = wp > 0 ? Math.round((profit / wp) * 100) : 100;
                    return (
                      <div className="bg-[#151f36]/80 border border-white/10 rounded-xl p-3 flex items-center justify-between text-xs animate-in fade-in">
                        <span className="text-slate-300 font-semibold">Calculated Profit (Selling - Wholesale):</span>
                        <span className={`font-black text-sm ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ₹{profit.toLocaleString()} {wp > 0 ? `(${marginPct}%)` : ''}
                        </span>
                      </div>
                    );
                  })()}

                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setNewProductForm({ name: "", wholesalePrice: "", price: "", productType: "Single product" });
                        setNewProductImages([]);
                        setNewProductExistingImages([]);
                        setEditProductId(null);
                      }}
                      className="flex-1 px-5 py-3 rounded-xl font-bold border border-white/20 bg-slate-800/80 text-slate-200 hover:bg-slate-700/80 hover:text-white transition-all cursor-pointer text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingProduct}
                      className={`flex-1 px-5 py-3 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/40 hover:shadow-xl transition-all cursor-pointer text-sm ${isSavingProduct ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      {isSavingProduct ? "Uploading to Cloudinary..." : (editProductId ? "Update Listing" : "Save Listing")}
                    </button>
                  </div>
                </form>
              </div>

              {/* 🟢 DEDICATED PRODUCTS TABLE (Chronological Order Added, Profit Calculation) */}
              <div className="bg-[#0d1527] p-5 md:p-6 rounded-[2rem] shadow-2xl border border-white/15 text-white">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-5 pb-4 border-b border-white/10">
                  <div>
                    <h3 className="text-lg md:text-xl font-black text-white flex items-center gap-2">
                      <ShoppingBag className="text-blue-400" size={20} />
                      <span>Product Listings Table ({filteredProducts.length})</span>
                      {productTypeFilter !== 'all' && (
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${productTypeFilter === 'Combo set' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'}`}>
                          {productTypeFilter}
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium mt-0.5">
                      Items are shown in the exact order added with auto-calculated profit margins.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto">
                    {/* Top Section Product Type Filter Dropdown */}
                    <div className="relative">
                      <select
                        aria-label="Filter products list by type"
                        value={productTypeFilter}
                        onChange={(e) => setProductTypeFilter(e.target.value)}
                        className="w-full sm:w-auto pl-3 pr-8 py-2 bg-[#15213b] border border-white/20 rounded-xl text-xs font-bold text-white outline-none focus:border-amber-400 cursor-pointer appearance-none transition-colors"
                      >
                        <option value="all" className="bg-[#15213b] text-white">All Types ({orderedProducts.length})</option>
                        <option value="Single product" className="bg-[#15213b] text-cyan-300">Single Products ({singleProductsCount})</option>
                        <option value="Combo set" className="bg-[#15213b] text-purple-300">Combo Sets ({comboSetsCount})</option>
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-400">
                        <ChevronDown size={14} />
                      </div>
                    </div>

                    {/* Search Filter */}
                    <div className="relative w-full sm:w-60">
                      <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
                      <input
                        type="text"
                        placeholder="Search product name..."
                        value={productSearchQuery}
                        onChange={(e) => setProductSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-[#15213b] border border-white/20 rounded-xl text-xs font-bold text-white placeholder:text-slate-400 outline-none focus:border-blue-400 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                {orderedProducts.length === 0 ? (
                  <div className="py-16 text-center space-y-3">
                    <Package size={48} className="mx-auto text-slate-600 animate-pulse" />
                    <p className="text-lg font-bold text-slate-400">No product listings added yet.</p>
                    <p className="text-xs text-slate-500">Fill in the "ADD NEW LISTING" form above to create your first product.</p>
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="py-16 text-center space-y-3">
                    <Package size={48} className="mx-auto text-slate-600 animate-pulse" />
                    <p className="text-lg font-bold text-slate-300">No matching products found</p>
                    <p className="text-xs text-slate-500">
                      {productTypeFilter !== 'all' ? `No products matching "${productTypeFilter}".` : 'Try adjusting your search criteria.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setProductTypeFilter('all');
                        setProductSearchQuery('');
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Reset Filters
                    </button>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-2xl border border-white/10 shadow-inner">
                    <table className="w-full text-left border-collapse text-xs md:text-sm">
                      <thead>
                        <tr className="bg-[#15213b] border-b border-white/10 text-slate-300 uppercase tracking-wider text-[11px] font-black">
                          <th className="py-3.5 px-4 text-center w-16">#</th>
                          <th className="py-3.5 px-4">Item Name</th>
                          <th className="py-3.5 px-4 text-center w-36">Product Type</th>
                          <th className="py-3.5 px-4 text-right">Wholesale Price (₹)</th>
                          <th className="py-3.5 px-4 text-right">Selling Price (₹)</th>
                          <th className="py-3.5 px-4 text-right">Profit (₹)</th>
                          <th className="py-3.5 px-4 text-center w-28">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredProducts.map((prod, index) => {
                            const sellPrice = Number(prod.price ?? prod.sellingPrice) || 0;
                            const wholePrice = Number(prod.wholesalePrice) || 0;
                            const profit = sellPrice - wholePrice;
                            const marginPct = wholePrice > 0 ? Math.round((profit / wholePrice) * 100) : 100;
                            const isCurrentlyEditing = editProductId === prod.fireId;
                            const pType = prod.productType || "Single product";

                            return (
                              <tr
                                key={prod.fireId || index}
                                className={`hover:bg-[#15213b]/60 transition-colors ${isCurrentlyEditing ? 'bg-amber-500/15 border-l-4 border-l-amber-400' : ''}`}
                              >
                                {/* # / Order Number */}
                                <td className="py-3.5 px-4 text-center font-black text-amber-400">
                                  {index + 1}
                                </td>

                                {/* Item Name */}
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-3">
                                    {prod.images && prod.images.length > 0 ? (
                                      <img
                                        src={prod.images[0]}
                                        alt={prod.name}
                                        onClick={() => {
                                          setImageGalleryProduct(prod);
                                          setGalleryActiveIndex(0);
                                          setIsImageGalleryOpen(true);
                                        }}
                                        className="w-9 h-9 rounded-lg object-cover border border-amber-400/40 shadow-sm cursor-pointer hover:scale-110 transition-transform shrink-0"
                                        title="Click to view full photo gallery"
                                      />
                                    ) : (
                                      <div className="w-9 h-9 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center font-black text-xs border border-blue-500/30 shrink-0">
                                        {prod.name ? prod.name.charAt(0).toUpperCase() : 'P'}
                                      </div>
                                    )}
                                    <span className="font-extrabold text-white tracking-wide">
                                      {prod.name}
                                    </span>
                                  </div>
                                </td>

                                {/* Product Type */}
                                <td className="py-3.5 px-4 text-center">
                                  {pType === "Combo set" ? (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm">
                                      <Boxes size={12} className="text-purple-400" />
                                      Combo set
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 shadow-sm">
                                      <Package size={12} className="text-cyan-400" />
                                      Single product
                                    </span>
                                  )}
                                </td>

                                {/* Wholesale Price */}
                                <td className="py-3.5 px-4 text-right font-black text-blue-400">
                                  ₹{wholePrice.toLocaleString()}
                                </td>

                                {/* Selling Price */}
                                <td className="py-3.5 px-4 text-right font-black text-emerald-400">
                                  ₹{sellPrice.toLocaleString()}
                                </td>

                                {/* Profit = Selling Price - Wholesale Price */}
                                <td className="py-3.5 px-4 text-right">
                                  <div className="flex flex-col items-end">
                                    <span className={`font-black text-sm ${profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      ₹{profit.toLocaleString()}
                                    </span>
                                    <span className={`text-[10px] font-bold ${profit >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'}`}>
                                      {marginPct}% margin
                                    </span>
                                  </div>
                                </td>

                                {/* Actions */}
                                <td className="py-3.5 px-4 text-center">
                                  <div className="inline-grid grid-cols-2 gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleEditProductClick(prod)}
                                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-blue-500/15 hover:bg-blue-500/30 text-blue-400 hover:text-blue-300 transition-all duration-200 cursor-pointer hover:scale-110 active:scale-95"
                                      title="Edit Listing"
                                    >
                                      <Pencil size={15} />
                                    </button>
                                    <label
                                      className={`w-8 h-8 flex items-center justify-center rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-400 hover:text-amber-300 transition-all duration-200 cursor-pointer hover:scale-110 active:scale-95 ${imageUploadingFor === prod.fireId ? 'animate-pulse' : ''}`}
                                      title="Upload Images"
                                    >
                                      <ImageIcon size={15} />
                                      <input
                                        type="file"
                                        accept="image/jpeg,image/jpg,image/png,image/webp"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                          if (e.target.files && e.target.files.length > 0) {
                                            handleImageUpload(prod.fireId, e.target.files);
                                          }
                                          e.target.value = '';
                                        }}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (prod.images && prod.images.length > 0) {
                                          setImageGalleryProduct(prod);
                                          setGalleryActiveIndex(0);
                                          setIsImageGalleryOpen(true);
                                        } else {
                                          toast('No images uploaded yet', { icon: '📷' });
                                        }
                                      }}
                                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 hover:text-emerald-300 transition-all duration-200 cursor-pointer relative hover:scale-110 active:scale-95"
                                      title={prod.images && prod.images.length > 0 ? `View ${prod.images.length} Image(s)` : 'No images yet'}
                                    >
                                      <Eye size={15} />
                                      {prod.images && prod.images.length > 0 && (
                                        <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[8px] font-black rounded-full w-4 h-4 flex items-center justify-center shadow-lg shadow-amber-500/40 ring-2 ring-[#0d1527]">{prod.images.length}</span>
                                      )}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteProductClick(prod.fireId)}
                                      className="w-8 h-8 flex items-center justify-center rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-400 hover:text-rose-300 transition-all duration-200 cursor-pointer hover:scale-110 active:scale-95"
                                      title="Delete Listing"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                      {/* Summary Row */}
                      {filteredProducts.length > 0 && (() => {
                        const totalWholesale = filteredProducts.reduce((sum, p) => sum + (Number(p.wholesalePrice) || 0), 0);
                        const totalSelling = filteredProducts.reduce((sum, p) => sum + (Number(p.price ?? p.sellingPrice) || 0), 0);
                        const totalProfit = totalSelling - totalWholesale;
                        const avgMarginPct = totalWholesale > 0 ? Math.round((totalProfit / totalWholesale) * 100) : 0;
                        return (
                          <tfoot>
                            <tr className="bg-[#121a2d] border-t-2 border-white/15 font-black text-xs md:text-sm">
                              <td className="py-3.5 px-4 text-center text-amber-400">Total</td>
                              <td className="py-3.5 px-4 text-slate-300 font-bold">{filteredProducts.length} Listings</td>
                              <td className="py-3.5 px-4 text-center text-slate-400 text-xs font-semibold">
                                {productTypeFilter === 'all' ? `${singleProductsCount} Single / ${comboSetsCount} Combo` : productTypeFilter}
                              </td>
                              <td className="py-3.5 px-4 text-right text-blue-400">₹{totalWholesale.toLocaleString()}</td>
                              <td className="py-3.5 px-4 text-right text-emerald-400">₹{totalSelling.toLocaleString()}</td>
                              <td className="py-3.5 px-4 text-right">
                                <span className={`text-sm ${totalProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  ₹{totalProfit.toLocaleString()} ({avgMarginPct}%)
                                </span>
                              </td>
                              <td className="py-3.5 px-4"></td>
                            </tr>
                          </tfoot>
                        );
                      })()}
                    </table>
                  </div>
                )}
              </div>

            </div>
          )}



          {activeTab === 'inventories' && (
            <div className="space-y-6 print:hidden animate-in fade-in duration-300">

              <div className="bg-[#0d1527] p-4 rounded-2xl shadow-2xl border border-white/15 flex justify-between items-center gap-4">
                <h2 className="text-xl font-black text-amber-400 flex items-center gap-2">
                  <Archive className="text-amber-400" /> Stock Control Center
                </h2>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => document.getElementById('inventories-wallpaper-upload')?.click()}
                    className="flex justify-center items-center w-10 h-10 font-bold rounded-lg transition-colors border bg-[#131c2e] text-amber-400 border-white/15 hover:bg-[#18243b] cursor-pointer shadow-sm"
                    title="Set Background Wallpaper"
                  >
                    <ImageIcon size={18} className="text-amber-400" />
                  </button>
                  <input
                    type="file"
                    id="inventories-wallpaper-upload"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleWallpaperUpload(e, 'inventories')}
                  />
                  {invWallpaper && (
                    <button
                      onClick={() => handleClearWallpaper('inventories')}
                      className="w-10 h-10 flex justify-center items-center text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 border border-white/15 rounded-lg cursor-pointer bg-[#131c2e] shadow-sm"
                      title="Remove Background"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              <div
                className={`p-5 rounded-[2rem] transition-all duration-500 ${isWallpaperActive
                    ? 'bg-[#0d1527]/80 backdrop-blur-xl border border-white/20 shadow-2xl'
                    : 'bg-[#0d1527] border border-white/15 shadow-2xl'
                  }`}
              >
                <div className="flex items-center justify-center gap-3 mb-6">
                  <h2 className="text-3xl font-black text-amber-400 tracking-widest uppercase" style={{ textShadow: "0 0 12px rgba(245,158,11,0.3)" }}>Live Stock Balance</h2>
                  <button
                    onClick={() => setActiveTab('inventories_admin_panel' as any)}
                    className="p-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-amber-400 hover:text-amber-300 rounded-xl shadow-sm cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center justify-center h-[34px] w-[34px] shrink-0"
                    title="Open Admin Cost Analytics"
                  >
                    <Settings size={16} strokeWidth={2.5} />
                  </button>
                </div>
                <div className="flex overflow-x-auto gap-4 pb-3 custom-scrollbar flex-nowrap">
                  {dynamicInventory.map((choc, i) => {
                    const bal = inventoryBalances[choc] || 0;
                    return (
                      <div
                        key={i}
                        className="p-3.5 rounded-2xl text-center border border-white/10 transition-all duration-300 shrink-0 min-w-[100px] sm:min-w-[125px] flex-1 flex flex-col justify-center items-center transform hover:scale-105 transition-transform bg-[#131c2e] hover:bg-[#18243b] shadow-md"
                      >
                        <span className="text-xs font-extrabold text-white uppercase leading-tight mb-2 h-8 flex items-center justify-center text-center px-1">
                          {choc}
                        </span>
                        <span className={`text-2xl font-black ${bal < 0
                            ? 'text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                            : bal === 0
                              ? 'text-slate-400'
                              : 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.4)]'
                          }`}>{bal}</span>
                      </div>
                    )
                  })}

                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                {/* Col 1: Sales Tracker & Inventory Value Comparison Doughnut */}
                <div className="flex flex-col h-full">
                  <div className="bg-[#0d1527] p-4 rounded-[1.5rem] shadow-2xl border border-white/15 flex flex-col h-full">
                    <h3 className="text-2xl font-black text-amber-400 mb-4 border-b border-white/10 pb-2 flex items-center gap-2"><TrendingUp size={22} /> Sales Tracker</h3>

                    <div className="space-y-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-2.5 text-amber-400" size={16} />
                        <select
                          value={salesTrackerChoc}
                          onChange={(e) => setSalesTrackerChoc(e.target.value)}
                          className="w-full pl-9 pr-4 py-2 font-bold rounded-xl outline-none border border-white/15 focus:border-amber-500 bg-[#131c2e] text-white shadow-inner appearance-none cursor-pointer"
                        >
                          <option value="All">All Chocolates</option>
                          {dynamicInventory.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex-1 relative">
                          <span className="text-[10px] font-bold text-amber-400 absolute -top-2 left-2 bg-[#0d1527] px-1">From</span>
                          <input
                            type="date"
                            value={salesTrackerFrom}
                            onChange={(e) => setSalesTrackerFrom(e.target.value)}
                            className="w-full text-xs font-bold rounded-xl p-2.5 outline-none border border-white/15 bg-[#131c2e] text-white shadow-inner"
                          />
                        </div>
                        <div className="flex-1 relative">
                          <span className="text-[10px] font-bold text-amber-400 absolute -top-2 left-2 bg-[#0d1527] px-1">To</span>
                          <input
                            type="date"
                            value={salesTrackerTo}
                            onChange={(e) => setSalesTrackerTo(e.target.value)}
                            className="w-full text-xs font-bold rounded-xl p-2.5 outline-none border border-white/15 bg-[#131c2e] text-white shadow-inner"
                          />
                        </div>
                      </div>

                      <div className="flex gap-4">
                        <div className="bg-amber-500/15 border border-amber-500/30 p-4 rounded-xl text-center shadow-sm flex-1">
                          <p className="text-xs font-black text-amber-400 uppercase tracking-wider mb-1">Total Items Sold</p>
                          <p className="text-3xl font-black text-amber-300">{trackedSalesResult.count}</p>
                        </div>
                        <div className="bg-emerald-500/15 border border-emerald-500/30 p-4 rounded-xl text-center shadow-sm flex-1">
                          <p className="text-xs font-black text-emerald-400 uppercase tracking-wider mb-1">Sales Amount</p>
                          <p className="text-3xl font-black text-emerald-300">₹{trackedSalesResult.revenue.toLocaleString()}</p>
                        </div>
                      </div>

                      {/* 🟢 DOUGHNUT CHART: INVENTORY VALUES COMPARISON */}
                      <div className="bg-[#131c2e] border border-white/10 p-4 rounded-xl shadow-inner flex flex-col items-center">
                        <p className="text-xs font-black text-amber-400 uppercase tracking-wider mb-2 text-center">
                          Inventory Value Comparison
                        </p>
                        <div className="w-full h-52">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={[
                                  { name: 'Current Inventory Value', value: currentInventoryValueData.grandTotal },
                                  { name: 'Approx Inventory Value', value: Math.round(approximateProfitData.grandTotal) }
                                ]}
                                cx="50%"
                                cy="45%"
                                innerRadius={42}
                                outerRadius={65}
                                paddingAngle={5}
                                dataKey="value"
                                isAnimationActive={true}
                              >
                                <Cell key="cell-0" fill="#d35400" />
                                <Cell key="cell-1" fill="#047857" />
                              </Pie>
                              <Tooltip
                                formatter={(val, name) => {
                                  const total = currentInventoryValueData.grandTotal + approximateProfitData.grandTotal;
                                  const pct = total > 0 ? ((Number(val) / total) * 100).toFixed(1) : '0';
                                  return [`₹${Number(val).toLocaleString()} (${pct}%)`, name];
                                }}
                                contentStyle={{
                                  backgroundColor: '#0d1527',
                                  color: '#fff',
                                  borderRadius: '0.75rem',
                                  border: '1px solid rgba(255,255,255,0.15)',
                                  fontSize: '12px',
                                  fontWeight: 'bold'
                                }}
                              />
                              <Legend
                                verticalAlign="bottom"
                                height={36}
                                formatter={(value) => <span className="text-xs font-black text-slate-100" style={{ color: '#f1f5f9' }}>{value}</span>}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Col 2 & 3: Inventory Log */}
                <div className="lg:col-span-2 bg-[#0d1527] p-4 rounded-[1.5rem] shadow-2xl border border-white/15 overflow-hidden flex flex-col h-full min-h-[500px]">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-2xl font-black text-amber-400">Inventory Log</h3>
                    <button onClick={() => {
                      setInvForm({
                        date: new Date().toISOString().split('T')[0],
                        chocolate: managedChocolates[0]?.name || "",
                        boxCount: "",
                        itemsPerBox: ""
                      });
                      setEditInvId(null);
                      setIsInvModalOpen(true);
                    }} className="bg-[#d35400] text-white px-4 py-2 rounded-xl font-black text-sm uppercase tracking-widest shadow-md hover:bg-[#a04000] hover:-translate-y-1 transition-all flex items-center gap-2">
                      <Plus size={16} /> Add Entry
                    </button>
                  </div>
                  <div className="overflow-y-auto max-h-[500px] flex-1 custom-scrollbar bg-[#131c2e] rounded-xl border border-white/10 shadow-inner">
                    <table className="w-full text-left border-collapse min-w-[600px]">
                      <thead className="sticky top-0 bg-[#0b1329] z-10 shadow-sm border-b border-amber-500/30">
                        <tr className="text-sm uppercase tracking-wider text-amber-400">
                          <th className="p-4 font-black border-r border-white/10">Date</th>
                          <th className="p-4 font-black border-r border-white/10">Chocolate Name</th>
                          <th className="p-4 font-black text-center border-r border-white/10">Boxes</th>
                          <th className="p-4 font-black text-center border-r border-white/10">Count</th>
                          <th className="p-4 font-black text-center border-r border-white/10">Total Added</th>
                          <th className="p-4 font-black text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inventoryLogs.length === 0 ? (
                          <tr><td colSpan={6} className="p-8 text-center text-slate-400 font-bold">No manual inventory entries found.</td></tr>
                        ) : (
                          inventoryLogs.map(log => (
                            <tr key={log.fireId} className="border-b border-white/5 text-sm hover:bg-white/5 transition-colors">
                              <td className="p-4 font-bold text-slate-300">{formatToDisplayDate(log.date)}</td>
                              <td className="p-4 font-bold text-white">{log.chocolate}</td>
                              <td className="p-4 text-center font-bold text-slate-300">{log.boxCount}</td>
                              <td className="p-4 text-center font-bold text-slate-300">{log.itemsPerBox}</td>
                              <td className="p-4 text-center font-black text-emerald-400">+{log.totalChocolates}</td>
                              <td className="p-4 text-center flex items-center justify-center gap-3">
                                <button onClick={() => setViewingInvLog(log)} className="text-sky-400 hover:text-sky-300 transition-colors" title="View Entry"><Eye size={18} /></button>
                                <button onClick={() => {
                                  setInvForm({
                                    date: log.date || new Date().toISOString().split('T')[0],
                                    chocolate: log.chocolate || (managedChocolates[0]?.name || ""),
                                    boxCount: String(log.boxCount || ""),
                                    itemsPerBox: String(log.itemsPerBox || "")
                                  });
                                  setEditInvId(log.fireId);
                                  setIsInvModalOpen(true);
                                }} className="text-blue-400 hover:text-blue-300 transition-colors" title="Edit Entry"><Pencil size={18} /></button>
                                <button onClick={() => handleDeleteInventory(log.fireId)} className="text-rose-400 hover:text-rose-300 transition-colors" title="Delete Entry"><Trash2 size={18} /></button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 mt-3 text-center shrink-0">* Note: Dashboard orders are automatically deducted from the Live Stock Balance (Not shown in this manual entry table).</p>
                </div>
              </div>

              {/* 🟢 HORIZONTAL LAYOUT: CURRENT INVENTORY VALUE & APPROX INVENTORY VALUE CARDS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                {/* Current Inventory Value Card */}
                <div style={{ backgroundColor: '#0d1527', color: '#ffffff' }} className="current-inventory-value-card bg-[#ebe6df] p-6 rounded-3xl shadow-2xl border border-amber-500/40 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 pb-4 border-b border-white/10">
                      <div>
                        <h3 className="text-xl font-black text-amber-400 uppercase tracking-wide flex items-center gap-2">Current Inventory Value</h3>
                        <p className="text-xs font-bold text-slate-300 mt-1">Live Stock Balance Breakdown Across All Inventories</p>
                      </div>
                      <div className="text-right mt-3 sm:mt-0">
                        <span className="text-[11px] font-extrabold text-slate-400 block uppercase tracking-wider">Grand Total Inventory Value</span>
                        <span className="text-3xl font-black text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]">₹{currentInventoryValueData.grandTotal.toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {currentInventoryValueData.items.map((item, idx) => (
                        <div key={idx} style={{ backgroundColor: '#131c2e' }} className="bg-[#131c2e] p-3.5 rounded-2xl border border-white/10 shadow-md transition-all flex flex-col justify-between hover:bg-[#18243b]">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-xs font-extrabold text-white truncate" title={item.name}>{item.name}</span>
                            <span className="text-xs font-black text-amber-300 shrink-0">₹{item.value.toLocaleString()}</span>
                          </div>
                          <div className="mt-2.5 flex justify-between items-center text-[11px] font-extrabold border-t border-white/10 pt-2 text-slate-300">
                            <span className="font-bold text-slate-400">Calculation:</span>
                            <span className="font-mono font-black text-amber-200 tracking-tight">{item.balance} × ₹{item.price}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Approx Inventory Value Card */}
                <div style={{ backgroundColor: '#0d1527', color: '#ffffff' }} className="approximate-profit-card bg-[#ebe6df] p-6 rounded-3xl shadow-2xl border border-emerald-500/40 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-5 pb-4 border-b border-white/10">
                      <div>
                        <h3 className="text-xl font-black text-emerald-400 uppercase tracking-wide flex items-center gap-2">Approx Inventory Value</h3>
                        <p className="text-xs font-bold text-slate-300 mt-1">Calculated Net Profit Breakdown Across All Inventories</p>
                      </div>
                      <div className="text-right mt-3 sm:mt-0">
                        <span className="text-[11px] font-extrabold text-slate-400 block uppercase tracking-wider">Grand Total Approx Inventory Value</span>
                        <span className="text-3xl font-black text-emerald-300 drop-shadow-[0_0_10px_rgba(16,185,129,0.4)]">₹{Math.round(approximateProfitData.grandTotal).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {approximateProfitData.items.map((item, idx) => (
                        <div key={idx} style={{ backgroundColor: '#131c2e' }} className="bg-[#131c2e] p-3.5 rounded-2xl border border-white/10 shadow-md transition-all flex flex-col justify-between hover:bg-[#18243b]">
                          <div className="flex justify-between items-center gap-2">
                            <span className="text-xs font-extrabold text-white truncate" title={item.name}>{item.name}</span>
                            <span className="text-xs font-black text-emerald-300 shrink-0">₹{Math.round(item.value).toLocaleString()}</span>
                          </div>
                          <div className="mt-2.5 flex justify-between items-center text-[11px] font-extrabold border-t border-white/10 pt-2 text-slate-300">
                            <span className="font-bold text-slate-400">Calculation:</span>
                            <span className="font-mono font-black text-emerald-200 tracking-tight">₹{Math.round(item.stickerCost || 0)} + ₹{Math.round(item.labourCost || 0)} + ₹{Math.round(item.totalPurchase || 0)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(activeTab === 'dashboard1' || activeTab === 'dashboard2') && (
            <div
              className={`relative p-6 rounded-[2.5rem] transition-all duration-500 overflow-hidden lg:flex-1 lg:min-h-0 lg:flex lg:flex-col ${isWallpaperActive ? 'wallpaper-active' : ''}`}
              style={{
                background: (activeTab === 'dashboard1' ? d1Wallpaper : d2Wallpaper) ? 'transparent' : 'transparent',
                border: 'none',
                boxShadow: 'none'
              }}
            >

              <div className="relative z-10 flex flex-col gap-6 lg:flex-1 lg:min-h-0">
                <div className={`grid grid-cols-1 sm:grid-cols-2 ${showHeader
                    ? 'lg:grid-cols-4'
                    : 'hidden'
                  } gap-3 md:gap-4 mb-6 print:hidden mt-1 items-stretch`}>

                  <div className="laptop-dashboard-metric-card relative bg-[#0d1527] p-3 md:p-3.5 rounded-[1.5rem] shadow-[0_10px_25px_rgba(0,0,0,0.5)] border-2 border-white/20 flex flex-col justify-between hover:-translate-y-1 transition-all duration-300 h-full min-h-[105px] md:min-h-[125px]">
                    <div className="flex justify-between items-start mb-1 relative z-10">
                      <p className="text-sm font-black text-amber-400 tracking-wide uppercase">Filtered Orders</p>
                      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-amber-500/20 text-amber-400 border border-amber-400/30 shadow-inner"><ShoppingBag size={16} /></div>
                    </div>
                    <div className="flex items-center justify-between gap-2 relative z-10 mt-auto">
                      <h3 className="text-3xl font-black text-white font-mono">{filteredDashboardOrders.length}</h3>
                      <select
                        value={tableTypeFilter}
                        onChange={(e) => setTableTypeFilter(e.target.value)}
                        className="p-2 border border-white/20 rounded-xl text-xs font-bold text-amber-300 outline-none focus:ring-2 focus:ring-amber-500 bg-[#162035] cursor-pointer shadow-inner"
                        title="Filter by Order Type (Sabi / Thaaru)"
                      >
                        <option value="All" className="bg-[#0d1527] text-white">All Types</option>
                        {orderTypes.map((ot, idx) => {
                          const name = getOrderTypeName(ot);
                          const id = getOrderTypeId(ot, idx);
                          return (
                            <option key={id} value={name} className="bg-[#0d1527] text-white">
                              {name}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </div>

                  {(() => {
                    if (activeTab === 'dashboard2') {
                      // Dashboard 2: Total Items Sold with Payment/Delivery/Product dropdowns
                      const d2TotalItemsSold = filteredDashboardOrders.reduce((sum, o) => {
                        const counts = String(o.count || 0).split(',').map(c => Number(c.trim()) || 0);
                        return sum + counts.reduce((s, val) => s + val, 0);
                      }, 0);

                      const uniqueProductNames = Array.from(new Set(
                        orders.filter(o => o.category === 'product')
                          .map(o => String(o.productName || o.chocolate || '').trim())
                          .filter(Boolean)
                      )).sort();

                      return (
                        <div className="laptop-dashboard-metric-card relative bg-[#0d1527] p-3 md:p-3.5 rounded-[1.5rem] shadow-[0_10px_25px_rgba(0,0,0,0.5)] border-2 border-white/20 flex flex-col justify-between hover:-translate-y-1 transition-all duration-300 h-full min-h-[105px] md:min-h-[125px]">
                          <div className="flex justify-between items-start mb-1 relative z-10">
                            <div className="flex items-center gap-1 group relative flex-1 min-w-0">
                              <p className="text-[12px] font-black text-white tracking-wide uppercase leading-tight truncate max-w-[110px] sm:max-w-[140px]" title="Total Items Sold">
                                TOTAL<br/>ITEMS SOLD
                              </p>
                            </div>
                            <div className="w-8 h-8 rounded-full flex items-center justify-center bg-amber-500/20 text-amber-400 border border-amber-400/30 shadow-inner shrink-0 ml-1">
                              <Gift size={16} />
                            </div>
                          </div>

                          {/* Dropdown Filters: Payment, Delivery, Product Name */}
                          <div className="flex items-center gap-1.5 my-1.5 relative z-20 flex-wrap">
                            {/* Payment Dropdown */}
                            <select
                              value={d2PaymentFilter}
                              onChange={(e) => setD2PaymentFilter(e.target.value as any)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-black border transition-all cursor-pointer shadow-sm ${
                                d2PaymentFilter === 'All'
                                  ? 'bg-slate-800/90 text-slate-300 border-white/10'
                                  : d2PaymentFilter === 'Full Paid'
                                  ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/50'
                                  : d2PaymentFilter === 'Partially Paid'
                                  ? 'bg-amber-500/25 text-amber-300 border-amber-400/50'
                                  : 'bg-rose-500/25 text-rose-300 border-rose-400/50'
                              }`}
                              title="Filter by Payment Status"
                            >
                              <option value="All" className="bg-[#0d1527] text-white">₹ Payment</option>
                              <option value="Full Paid" className="bg-[#0d1527] text-white">Full Paid</option>
                              <option value="Partially Paid" className="bg-[#0d1527] text-white">Partially Paid</option>
                              <option value="Pending" className="bg-[#0d1527] text-white">Pending</option>
                            </select>

                            {/* Delivery Dropdown */}
                            <select
                              value={d2DeliveryFilter}
                              onChange={(e) => setD2DeliveryFilter(e.target.value as any)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-black border transition-all cursor-pointer shadow-sm ${
                                d2DeliveryFilter === 'All'
                                  ? 'bg-slate-800/90 text-slate-300 border-white/10'
                                  : d2DeliveryFilter === 'Delivered'
                                  ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/50'
                                  : 'bg-amber-500/25 text-amber-300 border-amber-400/50'
                              }`}
                              title="Filter by Delivery Status"
                            >
                              <option value="All" className="bg-[#0d1527] text-white">🚚 Delivery</option>
                              <option value="In Process" className="bg-[#0d1527] text-white">In Process</option>
                              <option value="Delivered" className="bg-[#0d1527] text-white">Delivered</option>
                            </select>

                            {/* Product Name Dropdown */}
                            <select
                              value={d2ChocFilter}
                              onChange={(e) => setD2ChocFilter(e.target.value)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-black border transition-all cursor-pointer shadow-sm max-w-[100px] truncate ${
                                d2ChocFilter
                                  ? 'bg-amber-500/25 text-amber-300 border-amber-400/50'
                                  : 'bg-slate-800/90 text-slate-300 border-white/10'
                              }`}
                              title="Filter by Product Name"
                            >
                              <option value="" className="bg-[#0d1527] text-white">All Products</option>
                              {uniqueProductNames.map((pName, idx) => (
                                <option key={idx} value={pName} className="bg-[#0d1527] text-white">{pName}</option>
                              ))}
                            </select>
                          </div>

                          {/* Total Quantity Count */}
                          <div className="flex items-end justify-between gap-1 relative z-10 mt-auto w-full">
                            <div className="flex items-baseline gap-1">
                              <h3 className="text-3xl font-black text-white font-mono">{d2TotalItemsSold.toLocaleString()}</h3>
                              <span className="text-[10px] font-black text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-400/30 shadow-sm leading-none mb-1">Pcs</span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // Dashboard 1: Total Chocolates with existing chocolate filter
                    const isAll = !d1SelectedChocolateBoxFilter || d1SelectedChocolateBoxFilter === "All Chocolates";
                    const displayTotalItems = isAll
                      ? availableChocolatesData.preChocTotalItems
                      : (availableChocolatesData.chocolateCountsMap[d1SelectedChocolateBoxFilter]
                          ?? (availableChocolatesData.topChocolates.find(c => c[0].toLowerCase() === d1SelectedChocolateBoxFilter.toLowerCase())?.[1] || 0));

                    return (
                    <div className="laptop-dashboard-metric-card relative bg-[#0d1527] p-3 md:p-3.5 rounded-[1.5rem] shadow-[0_10px_25px_rgba(0,0,0,0.5)] border-2 border-white/20 flex flex-col justify-between hover:-translate-y-1 transition-all duration-300 h-full min-h-[105px] md:min-h-[125px]">
                      {/* Top Row: Title + Dropdown + Gift Icon */}
                      <div className="flex justify-between items-start mb-1 relative z-10">
                        <div className="flex items-center gap-1 group relative flex-1 min-w-0">
                          <p 
                            className="text-[12px] font-black text-white tracking-wide uppercase leading-tight truncate max-w-[110px] sm:max-w-[140px]" 
                            title={isAll ? "Total Chocolates" : d1SelectedChocolateBoxFilter}
                          >
                            {isAll ? (
                              <>TOTAL<br/>CHOCOLATES</>
                            ) : (
                              d1SelectedChocolateBoxFilter
                            )}
                          </p>
                          <div className="relative inline-block shrink-0">
                            <ChevronDown size={14} className="text-white/70 hover:text-white cursor-pointer hover:scale-125 transition-transform" />
                            <select
                              value={d1SelectedChocolateBoxFilter}
                              onChange={(e) => {
                                const val = e.target.value;
                                setD1SelectedChocolateBoxFilter(val);
                                setD1ChocFilter(val === 'All Chocolates' ? '' : val);
                              }}
                              className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                              title="Filter by Chocolate"
                            >
                              <option value="All Chocolates" className="bg-[#0d1527] text-white">All Chocolates</option>
                              {availableChocolatesData.topChocolates.map((c, idx) => (
                                <option key={idx} value={c[0]} className="bg-[#0d1527] text-white">{c[0]}</option>
                              ))}
                            </select>
                          </div>
                          {!isAll && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setD1SelectedChocolateBoxFilter("All Chocolates");
                                setD1ChocFilter("");
                              }}
                              className="text-rose-400 hover:text-rose-300 hover:scale-125 transition-all ml-0.5 p-0.5 z-20 cursor-pointer rounded-full"
                              title="Reset to All Chocolates"
                            >
                              <X size={13} strokeWidth={3} />
                            </button>
                          )}
                        </div>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-amber-500/20 text-amber-400 border border-amber-400/30 shadow-inner shrink-0 ml-1">
                          <Gift size={16} />
                        </div>
                      </div>

                      {/* Middle Row: Money Icon & Delivery Icon Dropdowns */}
                      <div className="flex items-center gap-1.5 my-1.5 relative z-20 flex-wrap">
                        {/* 💰 Money / Payment Status Dropdown */}
                        <div className="relative d1-money-dropdown-container">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setD1DeliveryDropdownOpen(false);
                              setD1MoneyDropdownOpen(prev => !prev);
                            }}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black border transition-all cursor-pointer shadow-sm ${
                              d1PaymentFilter === 'All'
                                ? 'bg-slate-800/90 hover:bg-slate-700/90 text-slate-300 border-white/10 hover:text-white'
                                : d1PaymentFilter === 'Full Paid'
                                ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/50 hover:bg-emerald-500/35'
                                : d1PaymentFilter === 'Partially Paid'
                                ? 'bg-amber-500/25 text-amber-300 border-amber-400/50 hover:bg-amber-500/35'
                                : 'bg-rose-500/25 text-rose-300 border-rose-400/50 hover:bg-rose-500/35'
                            }`}
                            title="Filter by Payment Status (Money Icon)"
                          >
                            <IndianRupee size={11} className={
                              d1PaymentFilter === 'Full Paid' ? 'text-emerald-400' :
                              d1PaymentFilter === 'Partially Paid' ? 'text-amber-400' :
                              d1PaymentFilter === 'Pending' ? 'text-rose-400' : 'text-amber-400'
                            } />
                            <span>
                              {d1PaymentFilter === 'All' ? 'Payment' : d1PaymentFilter === 'Full Paid' ? 'Fully Paid' : d1PaymentFilter}
                            </span>
                            {d1PaymentFilter !== 'All' ? (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setD1PaymentFilter('All');
                                }}
                                className="hover:scale-125 transition-transform text-rose-400 hover:text-rose-200 p-0.5"
                                title="Clear Payment Filter"
                              >
                                <X size={10} strokeWidth={3} />
                              </span>
                            ) : (
                              <ChevronDown size={10} className="text-slate-400 ml-0.5" />
                            )}
                          </button>

                          {d1MoneyDropdownOpen && (
                            <div 
                              className="absolute left-0 top-full mt-1.5 w-36 bg-[#0f172a] border border-white/20 rounded-xl shadow-2xl p-1.5 z-50 text-xs space-y-1 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setD1PaymentFilter('All');
                                  setD1MoneyDropdownOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left font-bold transition-colors cursor-pointer ${
                                  d1PaymentFilter === 'All' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <IndianRupee size={12} className="text-slate-400" />
                                  <span>All Payments</span>
                                </span>
                                {d1PaymentFilter === 'All' && <Check size={12} className="text-amber-400" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setD1PaymentFilter('Full Paid');
                                  setD1MoneyDropdownOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left font-bold transition-colors cursor-pointer ${
                                  d1PaymentFilter === 'Full Paid' ? 'bg-emerald-500/25 text-emerald-300' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                                  <span>Fully Paid</span>
                                </span>
                                {d1PaymentFilter === 'Full Paid' && <Check size={12} className="text-emerald-400" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setD1PaymentFilter('Partially Paid');
                                  setD1MoneyDropdownOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left font-bold transition-colors cursor-pointer ${
                                  d1PaymentFilter === 'Partially Paid' ? 'bg-amber-500/25 text-amber-300' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
                                  <span>Partially Paid</span>
                                </span>
                                {d1PaymentFilter === 'Partially Paid' && <Check size={12} className="text-amber-400" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setD1PaymentFilter('Pending');
                                  setD1MoneyDropdownOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left font-bold transition-colors cursor-pointer ${
                                  d1PaymentFilter === 'Pending' ? 'bg-rose-500/25 text-rose-300' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-rose-400 inline-block shadow-[0_0_6px_rgba(244,63,94,0.8)]" />
                                  <span>Pending</span>
                                </span>
                                {d1PaymentFilter === 'Pending' && <Check size={12} className="text-rose-400" />}
                              </button>
                            </div>
                          )}
                        </div>

                        {/* 🚚 Delivery Status Dropdown */}
                        <div className="relative d1-delivery-dropdown-container">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setD1MoneyDropdownOpen(false);
                              setD1DeliveryDropdownOpen(prev => !prev);
                            }}
                            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black border transition-all cursor-pointer shadow-sm ${
                              d1DeliveryFilter === 'All'
                                ? 'bg-slate-800/90 hover:bg-slate-700/90 text-slate-300 border-white/10 hover:text-white'
                                : d1DeliveryFilter === 'Delivered'
                                ? 'bg-emerald-500/25 text-emerald-300 border-emerald-400/50 hover:bg-emerald-500/35'
                                : 'bg-amber-500/25 text-amber-300 border-amber-400/50 hover:bg-amber-500/35'
                            }`}
                            title="Filter by Delivery Status (Delivery Icon)"
                          >
                            <Truck size={11} className={
                              d1DeliveryFilter === 'Delivered' ? 'text-emerald-400' :
                              d1DeliveryFilter === 'In Process' ? 'text-amber-400' : 'text-cyan-400'
                            } />
                            <span>{d1DeliveryFilter === 'All' ? 'Delivery' : d1DeliveryFilter}</span>
                            {d1DeliveryFilter !== 'All' ? (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setD1DeliveryFilter('All');
                                }}
                                className="hover:scale-125 transition-transform text-rose-400 hover:text-rose-200 p-0.5"
                                title="Clear Delivery Filter"
                              >
                                <X size={10} strokeWidth={3} />
                              </span>
                            ) : (
                              <ChevronDown size={10} className="text-slate-400 ml-0.5" />
                            )}
                          </button>

                          {d1DeliveryDropdownOpen && (
                            <div 
                              className="absolute left-0 top-full mt-1.5 w-36 bg-[#0f172a] border border-white/20 rounded-xl shadow-2xl p-1.5 z-50 text-xs space-y-1 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  setD1DeliveryFilter('All');
                                  setD1DeliveryDropdownOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left font-bold transition-colors cursor-pointer ${
                                  d1DeliveryFilter === 'All' ? 'bg-amber-500/20 text-amber-300' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <Truck size={12} className="text-slate-400" />
                                  <span>All Delivery</span>
                                </span>
                                {d1DeliveryFilter === 'All' && <Check size={12} className="text-amber-400" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setD1DeliveryFilter('In Process');
                                  setD1DeliveryDropdownOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left font-bold transition-colors cursor-pointer ${
                                  d1DeliveryFilter === 'In Process' ? 'bg-amber-500/25 text-amber-300' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
                                  <span>In Process</span>
                                </span>
                                {d1DeliveryFilter === 'In Process' && <Check size={12} className="text-amber-400" />}
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setD1DeliveryFilter('Delivered');
                                  setD1DeliveryDropdownOpen(false);
                                }}
                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left font-bold transition-colors cursor-pointer ${
                                  d1DeliveryFilter === 'Delivered' ? 'bg-emerald-500/25 text-emerald-300' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <span className="flex items-center gap-1.5">
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                                  <span>Delivered</span>
                                </span>
                                {d1DeliveryFilter === 'Delivered' && <Check size={12} className="text-emerald-400" />}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Bottom Row: Total Quantity Count */}
                      <div className="flex items-end justify-between gap-1 relative z-10 mt-auto w-full">
                        <div className="flex items-baseline gap-1">
                          <h3 className="text-3xl font-black text-white font-mono">{displayTotalItems.toLocaleString()}</h3>
                          <span className="text-[10px] font-black text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-400/30 shadow-sm leading-none mb-1">Pcs</span>
                        </div>
                      </div>
                    </div>
                    );
                  })()}


                  <div className="laptop-dashboard-metric-card relative bg-[#0d1527] p-3 md:p-3.5 rounded-[1.5rem] shadow-[0_10px_25px_rgba(0,0,0,0.5)] border-2 border-white/20 flex flex-col justify-between hover:-translate-y-1 transition-all duration-300 h-full min-h-[105px] md:min-h-[125px] overflow-hidden group">
                    {/* Animated Liquid Wave Filling Background */}
                    <div 
                      className="absolute bottom-0 left-0 right-0 transition-all duration-700 ease-out z-0 pointer-events-none rounded-b-[1.3rem] overflow-hidden"
                      style={{ height: `${Math.max(12, targetPercentage)}%` }}
                    >
                      <div className="relative w-full h-full bg-gradient-to-t from-blue-700/80 via-cyan-600/60 to-blue-500/40 backdrop-blur-[2px]">
                        <svg className="absolute -top-4 left-0 w-[200%] h-6 fill-cyan-300/80 liquid-wave-layer-1" viewBox="0 0 1200 120" preserveAspectRatio="none">
                          <path d="M0,0 C150,90 350,-40 500,40 C650,120 900,-20 1200,40 L1200,120 L0,120 Z"></path>
                        </svg>
                        <svg className="absolute -top-3 left-0 w-[200%] h-6 fill-emerald-300/60 liquid-wave-layer-2" viewBox="0 0 1200 120" preserveAspectRatio="none">
                          <path d="M0,0 C200,70 400,-30 600,50 C800,110 1000,-10 1200,30 L1200,120 L0,120 Z"></path>
                        </svg>
                      </div>
                    </div>

                    {/* Card Header: Title + Month/Year Picker + Target Edit Trigger */}
                    <div className="flex justify-between items-center mb-1 relative z-10">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-amber-400 tracking-wide uppercase drop-shadow-sm">Targets</p>
                        
                        {/* Month & Year Editable Picker Badge */}
                        <div className="relative">
                          <input
                            type="month"
                            value={targetMonthKey}
                            onChange={(e) => {
                              if (e.target.value) setTargetMonthKey(e.target.value);
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                            title="Click to Change Month & Year"
                          />
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs font-black text-amber-300 bg-slate-900/90 hover:bg-slate-900 px-2.5 py-1 rounded-xl border border-amber-400/50 shadow-md cursor-pointer transition-all hover:scale-105"
                          >
                            <span>{format(new Date(targetMonthKey + "-01"), "MMM yyyy")}</span>
                            <Pencil size={11} className="text-amber-400 ml-0.5" />
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {!isEditingTarget ? (
                          <button
                            onClick={() => {
                              setTargetInput(String(monthlyTarget));
                              setIsEditingTarget(true);
                            }}
                            className="w-7 h-7 rounded-full bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 flex items-center justify-center transition-all cursor-pointer border border-amber-400/40 shadow-md"
                            title="Edit Target Goal Quantity"
                          >
                            <Pencil size={13} />
                          </button>
                        ) : (
                          <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-amber-400 shadow-xl z-30">
                            <input
                              type="number"
                              value={targetInput}
                              onChange={(e) => setTargetInput(e.target.value)}
                              onKeyDown={(e) => e.key === 'Enter' && handleSaveTarget()}
                              className="w-16 px-1.5 py-0.5 text-xs font-black text-amber-300 outline-none bg-slate-800 rounded-lg border border-white/20"
                              placeholder="Target..."
                              autoFocus
                            />
                            <button
                              onClick={handleSaveTarget}
                              className="bg-emerald-500 hover:bg-emerald-600 text-white p-1 rounded-md text-[10px] font-black cursor-pointer"
                              title="Save Target Goal"
                            >
                              <Check size={12} strokeWidth={3} />
                            </button>
                            <button
                              onClick={() => setIsEditingTarget(false)}
                              className="bg-slate-700 hover:bg-slate-600 text-slate-200 p-1 rounded-md text-[10px] cursor-pointer"
                              title="Cancel"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )}
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-500 text-white shadow-lg border border-blue-300/40">
                          <Target size={16} />
                        </div>
                      </div>
                    </div>

                    {/* Middle: Live Progress Count with High Contrast */}
                    <div className="relative z-10 my-1">
                      <div className="flex items-baseline justify-between">
                        <span className="text-3xl font-black text-white tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] font-mono">
                          {selectedMonthItems.toLocaleString()}
                        </span>
                        <span className="text-sm font-black text-amber-300 tracking-wide drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                          / {monthlyTarget.toLocaleString()} Pcs
                        </span>
                      </div>
                      
                      {/* Progress Fill Bar */}
                      <div className="w-full h-2 bg-slate-900/80 rounded-full overflow-hidden mt-1.5 p-0.5 border border-white/20 shadow-inner">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(59,130,246,0.8)]"
                          style={{ width: `${targetPercentage}%` }}
                        />
                      </div>
                    </div>

                    {/* Footer: Dynamic Status Badges (Success / Failed / In Progress) */}
                    <div className="relative z-10 mt-auto pt-1 flex items-center justify-between">
                      <span className="text-xs font-black text-cyan-300 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] font-mono">
                        {targetPercentage}% Achieved
                      </span>

                      {isTargetCompleted ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.8)] flex items-center gap-1 animate-pulse border border-emerald-300">
                          🎉 Target Completed Success
                        </span>
                      ) : isTargetFailed ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-rose-600 text-white shadow-lg flex items-center gap-1 border border-rose-300">
                          ❌ Target Failed
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-400 text-slate-950 shadow-md flex items-center gap-1 border border-amber-300">
                          🚀 In Progress
                        </span>
                      )}
                    </div>
                  </div>


                  <div style={{ backgroundColor: '#0d1527', color: '#ffffff' }} className="laptop-dashboard-metric-card revenue-card-stat relative bg-[#0d1527] p-3 md:p-3.5 rounded-[1.5rem] shadow-[0_10px_25px_rgba(0,0,0,0.5)] border-2 border-emerald-500/40 flex flex-col justify-between hover:-translate-y-1 transition-all duration-300 h-full min-h-[105px] md:min-h-[120px]">
                    <div className="flex justify-between items-start w-full mb-1.5 relative z-10">
                      <div className="flex items-center gap-1 group relative">
                        <p className="text-[11px] font-black text-amber-400 tracking-wide leading-tight uppercase">Revenue <br />Filter</p>

                        <div className="relative inline-block">
                          <ChevronDown size={14} className="text-amber-400 cursor-pointer hover:scale-125 transition-transform" />
                          <select
                            value={revenueDateType}
                            onChange={(e) => setRevenueDateType(e.target.value)}
                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                            title="Select Filter Basis"
                          >
                            <option value="Serial No">Serial No</option>
                            <option value="Order Date">Order Date</option>
                            <option value="Function Date">Function Date</option>
                            <option value="Dispatch Date">Dispatch Date</option>
                          </select>
                        </div>

                        {/* 🟢 EYE ICON TOGGLE FOR MONETARY VALUES */}
                        <button
                          type="button"
                          onClick={() => setShowAmounts(!showAmounts)}
                          className="ml-1 p-1 rounded-lg bg-[#162035] hover:bg-[#1e2c47] text-amber-400 hover:text-amber-300 transition-all cursor-pointer shadow-sm border border-amber-400/60 flex items-center justify-center shrink-0"
                          title={showAmounts ? "Hide monetary amounts" : "Show monetary amounts"}
                        >
                          {showAmounts ? <Eye size={13} /> : <EyeOff size={13} />}
                        </button>
                      </div>

                      <div className="text-right">
                        <div className="flex items-center justify-end gap-1.5 mb-1">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/50 text-[10px] font-black uppercase tracking-wider shadow-sm">Revenue</span>
                          
                          {/* Month & Year Picker Badge - High contrast dark slate pill with gold typography */}
                          <div className="relative flex items-center">
                            <input
                              type="month"
                              value={revenueMonthKey}
                              onChange={(e) => {
                                if (e.target.value) handleRevenueMonthChange(e.target.value);
                              }}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                              title="Click to Filter Revenue by Month & Year"
                            />
                            <button
                              type="button"
                              className="flex items-center gap-1.5 text-[10px] font-black text-amber-300 bg-[#162035] hover:bg-[#1f2d4a] px-2.5 py-1 rounded-lg border border-amber-400/90 shadow-md cursor-pointer transition-all hover:scale-105"
                            >
                              <span className="text-amber-300 font-extrabold">{revenueMonthKey ? format(new Date(revenueMonthKey + "-01"), "MMM yyyy") : "Select Month"}</span>
                              <Pencil size={10} className="text-amber-400 shrink-0" />
                            </button>
                            {revenueMonthKey && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRevenueMonthChange("");
                                }}
                                className="ml-1 p-0.5 rounded-full bg-rose-500/30 hover:bg-rose-500 text-rose-300 hover:text-white transition-colors cursor-pointer z-30"
                                title="Clear Month Filter"
                              >
                                <X size={10} strokeWidth={3} />
                              </button>
                            )}
                          </div>
                        </div>
                        <h3 className="text-2xl font-black text-emerald-400 leading-tight tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]">{maskAmount(displayRevenue)}</h3>
                        <div className="text-[9px] font-bold text-rose-400/90 uppercase tracking-wider mt-1">Pending Amount</div>
                        <h4 className="text-base font-black text-rose-400 leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{maskAmount(displayPendingAmount)}</h4>
                      </div>
                    </div>

                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider -mt-1 mb-1.5 z-10 relative">
                      Based on: <span className="text-amber-400 font-extrabold">{revenueDateType}</span>
                    </p>

                    <div className="flex items-center gap-1 mt-auto relative z-10 w-full">
                      <input
                        type="date"
                        value={dateFilter.from}
                        onChange={e => setDateFilter({ ...dateFilter, from: e.target.value })}
                        className="flex-1 w-full min-w-0 px-1.5 py-1 border border-white/20 rounded-lg text-[10px] font-bold text-white outline-none focus:border-amber-400 bg-[#162035] cursor-pointer shadow-inner tracking-tight"
                        title="From Date"
                      />

                      <span className="text-[10px] font-black text-amber-400 shrink-0 px-0.5">To</span>

                      <input
                        type="date"
                        value={dateFilter.to}
                        onChange={e => setDateFilter({ ...dateFilter, to: e.target.value })}
                        className="flex-1 w-full min-w-0 px-1.5 py-1 border border-white/20 rounded-lg text-[10px] font-bold text-white outline-none focus:border-amber-400 bg-[#162035] cursor-pointer shadow-inner tracking-tight"
                        title="To Date"
                      />

                      {(dateFilter.from || dateFilter.to) && (
                        <button
                          onClick={() => {
                            setDateFilter({ from: "", to: "" });
                            setRevenueMonthKey("");
                          }}
                          className="text-white hover:bg-red-600 bg-red-500 p-1 rounded-full shrink-0 shadow-sm transition-colors cursor-pointer"
                          title="Clear Date Filter"
                        >
                          <X size={12} strokeWidth={3} />
                        </button>
                      )}
                    </div>
                  </div>

                </div>

                <div ref={screenshotTableRef} className={`order-records-table-container bg-[#0d1527] text-white flex flex-col lg:flex-1 lg:min-h-0 print:h-auto print:min-h-0 mb-2 lg:mb-0 ${isScreenshotMode ? 'screenshot-mode-active w-[1180px] min-w-[1180px] p-5 rounded-none shadow-none border-none overflow-visible' : 'rounded-2xl shadow-2xl border border-white/10 overflow-hidden'}`}>
                  <div className={`p-4 md:p-6 border-b flex flex-col lg:flex-row justify-between items-center gap-4 border-white/10 print:hidden ${isScreenshotMode ? 'hidden' : 'sticky top-0 z-30 bg-[#0d1527] backdrop-blur-sm shadow-sm'}`}>


                    <div className="flex items-center gap-4 w-full lg:w-auto flex-wrap sm:flex-nowrap">
                      <div className="flex items-center gap-3">
                        <h2 className={`text-2xl font-bold text-amber-400 whitespace-nowrap hidden md:block`}>Order Records</h2>
                        <button
                          onClick={() => {
                            const isAnyVisible = !hiddenCols.serialNo || !hiddenCols.role || !hiddenCols.orderDate || !hiddenCols.deliveryCharge || !hiddenCols.discount;
                            setHiddenCols({
                              ...hiddenCols,
                              serialNo: isAnyVisible,
                              role: isAnyVisible,
                              orderDate: isAnyVisible,
                              deliveryCharge: isAnyVisible,
                              discount: isAnyVisible
                            });
                          }}
                          className={`p-1.5 rounded-xl transition-all duration-300 print:hidden shadow-sm border ${(hiddenCols.serialNo && hiddenCols.role && hiddenCols.orderDate && hiddenCols.deliveryCharge && hiddenCols.discount)
                            ? 'bg-amber-600 text-white border-amber-700'
                            : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50'
                            }`}
                          title={(hiddenCols.serialNo && hiddenCols.role && hiddenCols.orderDate && hiddenCols.deliveryCharge && hiddenCols.discount) ? "Show all columns" : "Hide all columns"}
                        >
                          {(hiddenCols.serialNo && hiddenCols.role && hiddenCols.orderDate && hiddenCols.discount) ? <EyeOff size={18} strokeWidth={2.5} /> : <Eye size={18} strokeWidth={2.5} />}
                        </button>
                        <button
                          onClick={handleScreenshotCapture}
                          disabled={isScreenshotMode}
                          className={`p-1.5 rounded-xl transition-all duration-300 print:hidden shadow-sm border ${isScreenshotMode
                            ? 'bg-green-500 text-white border-green-600 animate-pulse'
                            : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50 hover:border-amber-400'
                            }`}
                          title={isScreenshotMode ? "Capturing..." : "Screenshot Table (Name, Dispatch, Chocolate, Count, Total Price, Payment)"}
                        >
                          <Camera size={18} strokeWidth={2.5} />
                        </button>
                        <div className="relative inline-block print:hidden">
                          <select
                            value={locationFilter}
                            onChange={(e) => setLocationFilter(e.target.value)}
                            className="h-8 pl-7 pr-7 bg-white border border-amber-300 rounded-xl text-[10px] font-black text-amber-950 outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-sm appearance-none uppercase tracking-wider"
                            title="Filter by Location"
                          >
                            <option value="All">All Locations</option>
                            <option value="Chennai">Chennai</option>
                            <option value="Kerala">Kerala</option>
                            <option value="Others">Others</option>
                          </select>
                          <MapPin size={12} strokeWidth={3} className="absolute left-2.5 top-2.5 text-amber-700 pointer-events-none" />
                          <ChevronDown size={12} className="absolute right-2 top-2.5 text-amber-700 pointer-events-none" />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const nextVal = !showCheckboxes;
                            setShowCheckboxes(nextVal);
                            if (!nextVal) {
                              setSelectedOrders([]);
                            }
                          }}
                          className={`h-8 w-8 rounded-xl transition-all duration-300 print:hidden shadow-sm border flex items-center justify-center shrink-0 ${showCheckboxes
                            ? 'bg-amber-600 text-white border-amber-700 shadow-md scale-105'
                            : 'bg-white text-amber-600 border-amber-200 hover:bg-amber-50 hover:border-amber-400'
                            }`}
                          title={showCheckboxes ? "Hide checkboxes" : "Show checkboxes"}
                        >
                          {showCheckboxes ? <CheckSquare size={15} strokeWidth={2.5} /> : <Square size={15} strokeWidth={2.5} />}
                        </button>

                        <div className="relative w-full max-w-[240px] sm:max-w-[280px] md:max-w-[360px] lg:max-w-[400px]">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500" size={16} />
                          <input
                            type="text"
                            placeholder="Search orders..."
                            value={dashboardSearch}
                            onChange={(e) => setDashboardSearch(e.target.value)}
                            className="pl-9 pr-4 py-2 bg-white border-2 border-amber-100 focus:border-amber-500 rounded-xl text-amber-950 font-bold placeholder-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 text-sm w-full shadow-sm h-9 md:h-10 transition-all duration-300"
                          />
                        </div>

                        {/* 🟢 ROLE FILTER DROPDOWN */}
                        <div className="relative shrink-0">
                          <select
                            value={roleFilter}
                            onChange={(e) => setRoleFilter(e.target.value)}
                            className="h-9 md:h-10 pl-8 pr-7 bg-white border-2 border-amber-100 focus:border-amber-500 rounded-xl text-xs font-black text-amber-950 outline-none focus:ring-2 focus:ring-amber-500/20 cursor-pointer shadow-sm appearance-none uppercase tracking-wider transition-all duration-300"
                            title="Filter by Role"
                          >
                            <option value="All">All Roles</option>
                            <option value="Self">Self</option>
                            <option value="Others">Others</option>
                          </select>
                          <User size={14} strokeWidth={2.5} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-700 pointer-events-none" />
                          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-amber-700 pointer-events-none" />
                        </div>

                        {/* 🟢 DUPLICATE CONTACT FILTER DROPDOWN (Dashboard 1) */}
                        {activeTab === 'dashboard1' && (
                          <div className="relative shrink-0">
                            <select
                              value={d1DuplicateFilter}
                              onChange={(e) => setD1DuplicateFilter(e.target.value as any)}
                              className={`h-9 md:h-10 pl-8 pr-7 border-2 rounded-xl text-xs font-black outline-none focus:ring-2 cursor-pointer shadow-sm appearance-none uppercase tracking-wider transition-all duration-300 ${
                                d1DuplicateFilter === 'Duplicates Only'
                                  ? 'bg-amber-600 text-white border-amber-700 focus:ring-amber-500/40 shadow-amber-600/30'
                                  : 'bg-white border-amber-100 text-amber-950 focus:border-amber-500 focus:ring-amber-500/20'
                              }`}
                              title="Filter by Duplicate Contact Numbers"
                            >
                              <option value="All">All Contacts</option>
                              <option value="Duplicates Only">
                                ⚠️ Duplicates ({Object.keys(activeDuplicatePhonesMap).length})
                              </option>
                              <option value="Non-Duplicates">Non-Duplicates</option>
                            </select>
                            <Bell size={14} strokeWidth={2.5} className={`absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none ${d1DuplicateFilter === 'Duplicates Only' ? 'text-white' : 'text-amber-700'}`} />
                            <ChevronDown size={12} className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${d1DuplicateFilter === 'Duplicates Only' ? 'text-white' : 'text-amber-700'}`} />
                          </div>
                        )}

                        {/* 🟢 PROMINENT CLEAR ALL FILTERS BUTTON */}
                        {isAnyFilterActive && (
                          <button
                            type="button"
                            onClick={handleClearAllFilters}
                            className="h-9 md:h-10 px-3.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white rounded-xl font-extrabold text-xs flex items-center gap-1.5 shadow-md hover:shadow-lg transition-all cursor-pointer animate-in fade-in zoom-in duration-200 shrink-0 border border-rose-400/40 uppercase tracking-wider"
                            title="Reset all active filters to default state"
                          >
                            <RotateCcw size={14} strokeWidth={2.5} />
                            <span>Clear All Filters</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {selectedOrders.length > 0 && (
                      <div className="flex items-center gap-2 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 animate-in fade-in zoom-in duration-200 shadow-sm shrink-0">
                        <span className="text-sm font-bold text-amber-800 hidden sm:inline">{selectedOrders.length} Selected:</span>
                        <select onChange={(e) => { if (e.target.value) handleBulkAction(e.target.value); e.target.value = ''; }} className="text-sm font-bold p-1.5 rounded border border-amber-300 bg-white text-amber-900 outline-none cursor-pointer">
                          <option value="">Change Status...</option>
                          <optgroup label="Delivery"><option value="Delivered">Mark Delivered</option><option value="In Process">Mark In Process</option></optgroup>
                          <optgroup label="Payment"><option value="Full Paid">Mark Full Paid</option><option value="Partially Paid">Mark Partially Paid</option><option value="Pending">Mark Pending</option></optgroup>
                        </select>
                        <button onClick={handleBulkDelete} className="text-red-500 hover:bg-red-100 p-1.5 rounded transition-colors" title="Delete Selected"><Trash2 size={18} /></button>
                      </div>
                    )}

                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full lg:w-auto print:hidden shrink-0 justify-center sm:justify-end">
                      {/* Gift Icon Button to open Winner Picker Modal */}
                      <button
                        type="button"
                        onClick={() => setIsWinnerPickerModalOpen(true)}
                        style={{
                          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)',
                          border: '2px solid #fef08a',
                          boxShadow: '0 4px 15px rgba(245, 158, 11, 0.45)'
                        }}
                        className="flex justify-center items-center w-10 h-10 rounded-xl transition-all hover:scale-110 active:scale-95 cursor-pointer shrink-0 relative group z-20"
                        title="Monthly Winner Picker Draw"
                      >
                        <Gift size={20} className="text-slate-950 fill-slate-950/30 group-hover:scale-110 transition-transform animate-bounce" />
                      </button>

                      {/* Wallpaper Customize Button (opens file manager directly) */}
                      <div className="flex items-center gap-1.5 print:hidden">
                        <button
                          onClick={() => {
                            const fileInput = document.getElementById(activeTab === 'dashboard1' ? 'd1-wallpaper-upload' : 'd2-wallpaper-upload');
                            fileInput?.click();
                          }}
                          className="flex justify-center items-center w-10 h-10 font-bold rounded-lg transition-colors border bg-white text-amber-900 border-amber-200 hover:bg-amber-50 cursor-pointer"
                          title="Background"
                        >
                          <ImageIcon size={18} className="text-amber-700" />
                        </button>
                        <input
                          type="file"
                          id={activeTab === 'dashboard1' ? 'd1-wallpaper-upload' : 'd2-wallpaper-upload'}
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            handleWallpaperUpload(e, activeTab === 'dashboard1' ? 'd1' : 'd2');
                          }}
                        />
                        {((activeTab === 'dashboard1' && d1Wallpaper) || (activeTab === 'dashboard2' && d2Wallpaper)) && (
                          <button
                            onClick={() => handleClearWallpaper(activeTab === 'dashboard1' ? 'd1' : 'd2')}
                            className="w-10 h-10 flex justify-center items-center text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-rose-200 rounded-lg cursor-pointer bg-white"
                            title="Remove Background"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>

                      {/* Notifications button/dropdown replacing Import/Export */}
                      <div className="relative">
                        <button
                          onClick={() => setShowNotificationDropdown(!showNotificationDropdown)}
                          className="flex justify-center items-center w-10 h-10 font-bold rounded-lg transition-colors border bg-white text-amber-900 border-amber-200 hover:bg-amber-50 cursor-pointer relative"
                          title="Notifications"
                        >
                          <Bell size={18} />
                          {(notifications.filter(n => !n.read).length + (activeTab === 'dashboard1' ? Object.keys(activeDuplicatePhonesMap).length : 0)) > 0 && (
                            <span className={`absolute -top-1.5 -right-1.5 w-5 h-5 text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow-md ${Object.keys(activeDuplicatePhonesMap).length > 0 || orders.some(o => o.orderStatus === 'forward to print (paid)' || o.orderStatus?.toLowerCase() === 'forward to print')
                              ? 'bg-gradient-to-r from-amber-600 to-rose-600 border border-amber-300 animate-pulse'
                              : 'bg-rose-600'
                              }`}>
                              {notifications.filter(n => !n.read).length + (activeTab === 'dashboard1' ? Object.keys(activeDuplicatePhonesMap).length : 0)}
                            </span>
                          )}
                        </button>

                        {showNotificationDropdown && (
                          <div
                            className="absolute right-0 top-full mt-2 z-[100] w-84 sm:w-96 rounded-2xl shadow-2xl border border-white/15 overflow-hidden animate-in fade-in slide-in-from-top-3 duration-200 notification-container-ref"
                            style={{
                              background: '#0d1527',
                              backdropFilter: 'blur(20px)',
                            }}
                          >
                            <div className="px-4 py-3 bg-white/5 border-b border-white/10 flex justify-between items-center shrink-0">
                              <span className="font-bold text-amber-400 text-sm flex items-center gap-1.5">
                                <Bell size={14} className="text-amber-400" /> Notifications
                                {(notifications.filter(n => !n.read).length + (activeTab === 'dashboard1' ? Object.keys(activeDuplicatePhonesMap).length : 0)) > 0 && (
                                  <span className={`px-2 py-0.5 text-[9px] rounded-full font-black text-white ${Object.keys(activeDuplicatePhonesMap).length > 0
                                    ? 'bg-amber-600 animate-pulse'
                                    : 'bg-rose-600'
                                    }`}>
                                    {notifications.filter(n => !n.read).length + (activeTab === 'dashboard1' ? Object.keys(activeDuplicatePhonesMap).length : 0)}
                                  </span>
                                )}
                              </span>
                              <button
                                onClick={() => {
                                  setShowNotificationDropdown(false);
                                  setActiveTab('dashboard1');
                                  handleAddClick('chocolate');
                                }}
                                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer border border-amber-500/20"
                              >
                                <Plus size={11} /> Add Order
                              </button>
                            </div>

                            {/* ⚠️ DUPLICATE CONTACT NUMBERS NOTIFICATION SECTION */}
                            {activeTab === 'dashboard1' && Object.keys(activeDuplicatePhonesMap).length > 0 && (
                              <div className="p-3 bg-amber-950/70 border-b border-amber-500/30">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                                    ⚠️ {Object.keys(activeDuplicatePhonesMap).length} Duplicate Contact Number{Object.keys(activeDuplicatePhonesMap).length > 1 ? 's' : ''}
                                  </span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => {
                                        setD1DuplicateFilter('Duplicates Only');
                                        setShowNotificationDropdown(false);
                                      }}
                                      className="text-[10px] font-bold text-amber-100 hover:text-white bg-amber-600 hover:bg-amber-700 px-2 py-0.5 rounded transition-colors cursor-pointer"
                                    >
                                      Filter Table
                                    </button>
                                    <button
                                      onClick={handleIgnoreAllDuplicates}
                                      className="text-[10px] font-bold text-slate-200 hover:text-white bg-slate-700 hover:bg-slate-600 px-2 py-0.5 rounded transition-colors cursor-pointer"
                                      title="Ignore all duplicate numbers"
                                    >
                                      Ignore All
                                    </button>
                                  </div>
                                </div>
                                <div className="space-y-1.5 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                                  {Object.entries(activeDuplicatePhonesMap).map(([phoneKey, data]) => (
                                    <div key={phoneKey} className="bg-slate-900/90 p-2 rounded-lg border border-amber-500/20 text-xs flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="text-slate-200 font-bold font-mono text-[11px] truncate">{formatPhoneNumber(data.rawPhone)}</p>
                                        <p className="text-[10px] text-amber-400 font-medium truncate">
                                          {data.count} Orders ({data.orders.map(o => o.name).filter(Boolean).join(', ')})
                                        </p>
                                      </div>
                                      <div className="flex items-center gap-1 shrink-0">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleIgnoreDuplicatePhone(phoneKey);
                                          }}
                                          className="px-2 py-1 bg-slate-800 hover:bg-rose-900/60 text-slate-200 hover:text-rose-200 rounded text-[10px] font-bold border border-slate-700 transition-colors cursor-pointer"
                                          title="Ignore this duplicate number"
                                        >
                                          Ignore
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="max-h-64 overflow-y-auto divide-y divide-white/10">
                              {notifications.length === 0 ? (
                                <div className="p-4 text-center text-xs text-slate-400 font-medium italic">
                                  No task notifications yet
                                </div>
                              ) : (
                                notifications.map((n) => (
                                  <div
                                    key={n.id}
                                    onClick={() => {
                                      setShowNotificationDropdown(false);
                                      handleNotificationClick(n);
                                    }}
                                    className={`p-3 text-xs transition-colors hover:bg-white/5 cursor-pointer ${!n.read ? 'bg-white/[0.03] font-bold' : 'text-slate-400'}`}
                                  >
                                    <div className="flex justify-between items-start gap-1">
                                      <p className="text-slate-200">{n.cardTitle} moved to Print</p>
                                      <span className="text-[9px] text-amber-400 shrink-0 font-bold">
                                        {new Date(n.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase()}
                                      </span>
                                    </div>
                                    <div className="flex justify-between items-center mt-1">
                                      <p className="text-[10px] text-slate-400 font-medium">{formatPhoneNumber(n.phoneNumber)}</p>
                                      <div className="flex items-center gap-1.5">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setShowNotificationDropdown(false);
                                            const phoneDigits = n.phoneNumber.replace(/\D/g, '');
                                            const waUrl = `https://wa.me/91${phoneDigits}`;
                                            window.open(waUrl, '_blank');
                                          }}
                                          className="p-1 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors flex items-center justify-center cursor-pointer border border-transparent"
                                          title="Chat on WhatsApp"
                                        >
                                          <MessageCircle size={14} className="stroke-[2.5]" />
                                        </button>
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setShowNotificationDropdown(false);
                                            handleAddOrderFromNotification(n);
                                          }}
                                          className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-[9px] font-bold shadow-sm transition-all cursor-pointer border border-amber-500/20"
                                        >
                                          + Add Order
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                            {(notifications.length > 0 || ignoredDuplicatePhones.length > 0) && (
                              <div className="px-4 py-2 border-t border-white/10 bg-white/5 flex justify-between items-center shrink-0">
                                <div className="flex items-center gap-3">
                                  {notifications.length > 0 && (
                                    <>
                                      <button
                                        onClick={markAllNotificationsAsRead}
                                        className="text-[11px] font-bold text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                                      >
                                        Mark all read
                                      </button>
                                      <button
                                        onClick={clearAllNotifications}
                                        className="text-[11px] font-bold text-rose-400 hover:text-rose-300 transition-colors cursor-pointer"
                                      >
                                        Clear all
                                      </button>
                                    </>
                                  )}
                                </div>
                                {ignoredDuplicatePhones.length > 0 && (
                                  <button
                                    onClick={handleResetIgnoredDuplicates}
                                    className="text-[11px] font-bold text-slate-400 hover:text-amber-300 transition-colors cursor-pointer"
                                    title="Clear ignored duplicate phone list"
                                  >
                                    Reset {ignoredDuplicatePhones.length} Ignored
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>


                      {/* More Options Popover Menu (Dashboard) */}
                      <Popover open={isDashMoreMenuOpen} onOpenChange={setIsDashMoreMenuOpen}>
                        <PopoverTrigger asChild>
                          <button
                            className="flex justify-center items-center w-10 h-10 font-bold rounded-lg transition-colors border bg-white text-amber-900 border-amber-200 hover:bg-amber-50 cursor-pointer shadow-sm"
                            title="More Options"
                          >
                            <MoreVertical size={18} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-52 p-1.5 bg-slate-900/95 border border-white/20 rounded-xl shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 backdrop-blur-xl">
                          <button
                            onClick={() => { setIsDashMoreMenuOpen(false); handleImportClick(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold text-slate-100 hover:bg-blue-500/20 hover:text-blue-300 rounded-lg transition-all text-left group cursor-pointer"
                          >
                            <Upload size={16} className="text-blue-400 group-hover:scale-110 transition-transform" />
                            <span>Import Excel</span>
                          </button>
                          <button
                            onClick={() => { setIsDashMoreMenuOpen(false); handleExportExcel(); }}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs font-bold text-slate-100 hover:bg-emerald-500/20 hover:text-emerald-300 rounded-lg transition-all text-left border-t border-white/10 mt-1 pt-2.5 group cursor-pointer"
                          >
                            <Download size={16} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                            <span>Export Excel</span>
                          </button>
                        </PopoverContent>
                      </Popover>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileImport}
                        accept=".xlsx,.xls"
                        className="hidden"
                      />



                      <button onClick={handleAddClick} className={`flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2 font-medium rounded-lg transition-colors shadow-sm bg-amber-600 text-white hover:bg-amber-700`}>
                        <Plus size={18} /> Add Order
                      </button>

                    </div>
                  </div>

                  <div 
                    ref={tableContainerRef} 
                    onScroll={(e) => {
                      const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
                      if (scrollHeight - scrollTop - clientHeight < 150) {
                        const startIndex = (currentPage - 1) * itemsPerPage;
                        const remaining = sortedDashboardOrders.length - startIndex;
                        if (continuousVisibleCount < remaining) {
                          setContinuousVisibleCount(prev => Math.min(prev + 10, remaining));
                        }
                      }
                    }}
                    className={`shadow-inner bg-white/50 custom-scrollbar left-scrollbar responsive-table-container relative ${isScreenshotMode ? 'h-auto flex-none w-[1180px] min-w-[1180px] overflow-visible' : 'w-full flex-1 overflow-x-auto overflow-y-auto lg:max-h-none lg:h-full lg:flex-1 lg:min-h-0'}`}
                  >

                    {/* 📸 Screenshot Header - Only visible during screenshot capture */}
                    {isScreenshotMode && (
                      <div
                        style={{
                          background: 'linear-gradient(to right, #0b0f19, #0d1527)',
                          padding: '16px 24px',
                          borderBottom: '2px solid rgba(251, 191, 36, 0.4)',
                          display: 'block',
                          width: '100%',
                          marginBottom: '10px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <h1 style={{ fontSize: '22px', fontWeight: 900, color: '#fbbf24', margin: 0, padding: 0, letterSpacing: '0.02em', fontFamily: "'Outfit', 'Inter', sans-serif" }}>
                              SABI RETURN GIFTS {screenshotPageInfo.totalPages > 1 ? `• Part ${screenshotPageInfo.page} of ${screenshotPageInfo.totalPages}` : ''}
                            </h1>
                            <p style={{ fontSize: '13px', fontWeight: 800, color: '#ffffff', margin: '3px 0 0 0' }}>
                              Order Records • {activeTab === 'dashboard2' ? 'Products' : 'Chocolates'} {screenshotPageInfo.totalPages > 1 ? `(Orders ${screenshotPageInfo.startNum}-${screenshotPageInfo.endNum} of ${screenshotPageInfo.totalOrders})` : ''}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: '13px', fontWeight: 800, color: '#fbbf24', margin: 0 }}>
                              {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                            </p>
                            <div style={{ display: 'flex', gap: '16px', marginTop: '4px', justifyContent: 'flex-end', alignItems: 'center' }}>
                              <span style={{ fontSize: '13px', fontWeight: 900, color: '#ffffff' }}>
                                Page Orders: {screenshotChunkOrders.length}
                              </span>
                              <span style={{ fontSize: '13px', fontWeight: 900, color: '#ffffff' }}>
                                Items: {screenshotChunkOrders.reduce((s, o) => {
                                  const cntStr = String(o.count || '0');
                                  const sum = cntStr.split(',').reduce((acc, c) => acc + (parseFloat(c.trim()) || 0), 0);
                                  return s + sum;
                                }, 0)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ⚠️ DUPLICATE CONTACT NUMBERS TOP BANNER */}
                    {activeTab === 'dashboard1' && Object.keys(activeDuplicatePhonesMap).length > 0 && d1DuplicateFilter === 'All' && !isScreenshotMode && (
                      <div className="mb-4 p-3 bg-gradient-to-r from-amber-950/30 via-orange-950/20 to-amber-950/30 border border-amber-500/40 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-md backdrop-blur-sm animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0 border border-amber-500/30">
                            <Bell size={18} className="animate-bounce text-amber-400" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-amber-200 flex items-center gap-2">
                              <span>⚠️ Duplicate Contact Numbers Found</span>
                              <span className="bg-amber-600 text-white text-[10px] px-2 py-0.5 rounded-full font-black shadow-sm">
                                {Object.keys(activeDuplicatePhonesMap).length} Duplicate{Object.keys(activeDuplicatePhonesMap).length > 1 ? 's' : ''}
                              </span>
                            </p>
                            <p className="text-[11px] font-medium text-amber-300/80">
                              Multiple orders have been placed using the same phone number. You can filter them or mark as ignored.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setD1DuplicateFilter('Duplicates Only')}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer border border-amber-400/30"
                          >
                            <Filter size={13} />
                            <span>Filter Duplicates</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleIgnoreAllDuplicates}
                            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-amber-200 border border-amber-400/30 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            Ignore All
                          </button>
                        </div>
                      </div>
                    )}

                    <table className={`w-full text-left border-separate border-spacing-0 print:min-w-0 print:w-full relative ${isScreenshotMode ? 'min-w-[1140px] w-[1140px]' : 'min-w-[1100px]'}`}>
                      <thead className={`${isScreenshotMode ? 'static bg-amber-400' : 'sticky top-0 z-20 shadow-md bg-amber-50/95 backdrop-blur-sm'} print:static`}>
                        {isScreenshotMode ? (
                          <tr className="text-xs border-b-2 uppercase tracking-wider bg-amber-400 text-black font-black border-amber-500">
                            <th className="py-3 pl-5 pr-2 font-black align-top w-[220px] min-w-[220px] text-left text-black">CUSTOMER NAME</th>
                            <th className="py-3 px-2 font-black align-top w-[120px] min-w-[120px] text-left text-black">DISPATCH DATE</th>
                            <th className="py-3 px-2 font-black align-top text-center w-[240px] min-w-[240px] text-black">{activeTab === 'dashboard2' ? 'PRODUCT NAME' : 'CHOCOLATE NAME'}</th>
                            <th className="py-3 px-2 font-black align-top text-center w-[80px] min-w-[80px] text-black">COUNT</th>
                            <th className="py-3 px-2 font-black align-top text-center w-[170px] min-w-[170px] text-black">PENDING AMOUNT</th>
                            <th className="py-3 px-2 font-black align-top text-center w-[150px] min-w-[150px] text-black">LOCATION</th>
                          </tr>
                        ) : (
                          <tr className={`text-xs border-b uppercase tracking-wider bg-amber-50 text-amber-800 border-amber-200 print:bg-gray-100 print:text-black`}>
                          {!isScreenshotMode && showCheckboxes && (
                            <th className="py-3 px-4 w-12 text-center print:hidden align-top">
                              <input type="checkbox" checked={isAllSelected} onChange={handleSelectAll} className="w-4 h-4 cursor-pointer accent-amber-600 rounded" />
                            </th>
                          )}
                          {!isScreenshotMode && !hiddenCols.serialNo && (
                            <th className="py-3 px-4 font-bold align-top transition-all duration-300 min-w-[90px]">
                              <div className="flex items-center gap-2 group">
                                <button onClick={jumpToActions} className="p-1 hover:bg-amber-100 rounded-full text-amber-600 transition-colors shadow-sm bg-white border border-amber-100 print:hidden" title="Jump to Actions">
                                  <ChevronRight size={14} strokeWidth={3} />
                                </button>
                                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                  <span className="whitespace-nowrap">Serial No</span>
                                  <div className="relative inline-flex items-center justify-center w-5 h-5 rounded-md cursor-pointer transition-colors" title="Sort Serial No">
                                    <ChevronDown size={14} className="text-amber-800/30 group-hover:text-amber-800 transition-opacity" />
                                    <select
                                      value={sortConfig?.key === 'id' ? sortConfig.direction : ""}
                                      onChange={(e) => {
                                        if (!e.target.value) setSortConfig(null);
                                        else setSortConfig({ key: 'id', direction: e.target.value as 'asc' | 'desc' });
                                      }}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    >
                                      <option value="">Sort...</option>
                                      <option value="asc">new to old</option>
                                      <option value="desc">old to new</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                            </th>
                          )}
                          {!isScreenshotMode && !hiddenCols.role && (
                            <th className="py-3 px-4 font-bold align-top transition-all duration-300 min-w-[90px]">
                              <div className="flex items-center gap-1 group">
                                <span className="whitespace-nowrap">Role</span>
                                <div className="relative inline-flex items-center justify-center w-5 h-5 hover:bg-amber-200 rounded-md cursor-pointer transition-colors" title="Filter by Role">
                                  <ChevronDown size={14} className={roleFilter !== 'All' ? 'text-amber-800' : 'text-amber-400'} />
                                  <select
                                    value={roleFilter}
                                    onChange={(e) => setRoleFilter(e.target.value)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  >
                                    <option value="All">All</option>
                                    <option value="Others">Others</option>
                                    <option value="Self">Self</option>
                                  </select>
                                </div>
                              </div>
                            </th>
                          )}
                          {!isScreenshotMode && !hiddenCols.orderDate && (
                            <th className="py-3 px-4 font-bold align-top transition-all duration-300 min-w-[130px]">
                              <div className="flex items-center gap-1 group">
                                <div className="flex items-center gap-1 animate-in fade-in slide-in-from-left-2 duration-300">
                                  <span className="whitespace-nowrap">Order Date</span>
                                  <div className="relative inline-flex items-center justify-center w-5 h-5 rounded-md cursor-pointer transition-colors" title="Sort Order Date">
                                    <ChevronDown size={14} className="text-amber-800/30 group-hover:text-amber-800 transition-opacity" />
                                    <select
                                      value={sortConfig?.key === 'orderDate' ? sortConfig.direction : ""}
                                      onChange={(e) => {
                                        if (!e.target.value) setSortConfig(null);
                                        else setSortConfig({ key: 'orderDate', direction: e.target.value as 'asc' | 'desc' });
                                      }}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    >
                                      <option value="">Sort...</option>
                                      <option value="desc">new to old</option>
                                      <option value="asc">old to new</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                            </th>
                          )}
                          <th className={`py-3 px-4 font-bold align-top ${isScreenshotMode ? 'min-w-[200px] text-amber-950 font-black' : ''}`}>
                            {isScreenshotMode ? 'Customer Name' : 'Name'}
                          </th>
                          {!isScreenshotMode && (
                            <th className="py-3 px-4 font-bold text-center align-top min-w-[120px]">
                              Location
                            </th>
                          )}
                          {!isScreenshotMode && (
                            <th className="py-3 px-4 font-bold align-top">
                              <div className="flex items-center gap-1 group">
                                <span>Contact Number</span>
                                {activeTab === 'dashboard1' && (
                                  <div className="relative inline-flex items-center justify-center w-5 h-5 hover:bg-amber-200 rounded-md cursor-pointer transition-colors" title="Filter Duplicates">
                                    <ChevronDown size={14} className={d1DuplicateFilter !== 'All' ? 'text-amber-800 font-bold' : 'text-amber-400'} />
                                    <select
                                      value={d1DuplicateFilter}
                                      onChange={(e) => setD1DuplicateFilter(e.target.value as any)}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                    >
                                      <option value="All">All Contacts</option>
                                      <option value="Duplicates Only">Duplicates Only ({Object.keys(activeDuplicatePhonesMap).length})</option>
                                      <option value="Non-Duplicates">Non-Duplicates</option>
                                    </select>
                                  </div>
                                )}
                              </div>
                            </th>
                          )}

                          {!isScreenshotMode && (
                            <th className="py-3 px-4 font-bold align-top min-w-[140px]">
                              <div className="flex flex-col gap-2">
                                <div className="flex items-center gap-2">
                                  <span>Function Date</span>
                                  <div className="relative inline-flex items-center justify-center w-7 h-7 hover:bg-amber-200 rounded-md cursor-pointer transition-colors" title="Select Dates">
                                    <Calendar size={16} className="text-amber-700 pointer-events-none" />
                                    <input
                                      type="date"
                                      value=""
                                      onChange={(e) => {
                                        if (e.target.value && !functionDates.includes(e.target.value)) {
                                          setFunctionDates([...functionDates, e.target.value]);
                                        }
                                      }}
                                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                    />
                                  </div>
                                </div>
                                {functionDates.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {functionDates.map(d => (
                                      <span key={d} className="flex items-center gap-1 bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                                        {formatToDisplayDate(d)}
                                        <X size={12} className="cursor-pointer hover:text-red-500" onClick={() => setFunctionDates(functionDates.filter(fd => fd !== d))} />
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </th>
                          )}

                          <th className="py-3 px-4 font-bold align-top min-w-[140px]">
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2">
                                <span>Dispatch Date</span>
                                <div className="relative inline-flex items-center justify-center w-5 h-5 rounded-md cursor-pointer transition-colors" title="Sort Dispatch Date">
                                  <ChevronDown size={14} className="text-amber-800/30 group-hover:text-amber-800 transition-opacity" />
                                  <select
                                    value={sortConfig?.key === 'deliveryDate' ? sortConfig.direction : ""}
                                    onChange={(e) => {
                                      if (!e.target.value) setSortConfig(null);
                                      else setSortConfig({ key: 'deliveryDate', direction: e.target.value as 'asc' | 'desc' });
                                    }}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  >
                                    <option value="">Sort...</option>
                                    <option value="desc">new to old</option>
                                    <option value="asc">old to new</option>
                                  </select>
                                </div>
                                <div className="relative inline-flex items-center justify-center w-7 h-7 hover:bg-amber-200 rounded-md cursor-pointer transition-colors" title="Select Dates">
                                  <Calendar size={16} className="text-amber-700 pointer-events-none" />
                                  <input
                                    type="date"
                                    value=""
                                    onChange={(e) => {
                                      if (e.target.value && !deliveryDates.includes(e.target.value)) {
                                        setDeliveryDates([...deliveryDates, e.target.value]);
                                      }
                                    }}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                  />
                                </div>
                              </div>
                              {deliveryDates.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {deliveryDates.map(d => (
                                    <span key={d} className="flex items-center gap-1 bg-white text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold shadow-sm">
                                      {formatToDisplayDate(d)}
                                      <X size={12} className="cursor-pointer hover:text-red-500" onClick={() => setDeliveryDates(deliveryDates.filter(dd => dd !== d))} />
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </th>

                          {/* ORDER STATUS removed from Dashboard 2 */}

                          <th className="py-3 px-4 font-bold align-top min-w-[150px] text-center">
                            <div className="flex items-center justify-center gap-1.5 group">
                              <span>{activeTab === 'dashboard2' ? 'Product Name' : 'Chocolate Name'}</span>

                              {/* Dropdown Filter for Chocolates or Products */}
                              <div className="relative inline-flex items-center justify-center w-5 h-5 hover:bg-amber-200 rounded-md cursor-pointer transition-colors" title={activeTab === 'dashboard2' ? "Filter by Product Name" : "Filter by Chocolate Name"}>
                                <ChevronDown size={14} className={chocFilter ? 'text-amber-800' : 'text-amber-400'} />
                                <select
                                  value={chocFilter}
                                  onChange={(e) => setChocFilter(e.target.value)}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                >
                                  {activeTab === 'dashboard2' ? (
                                    <>
                                      <option value="">All Products</option>
                                      {customProducts.map(p => (
                                        <option key={p.fireId || p.id} value={p.name}>{p.name}</option>
                                      ))}
                                    </>
                                  ) : (
                                    <>
                                      <option value="">All Chocolates</option>
                                      {availableChocolatesData.topChocolates.map((c, idx) => (
                                        <option key={idx} value={c[0]}>
                                          {c[0]}
                                        </option>
                                      ))}
                                    </>
                                  )}
                                </select>
                              </div>

                              {/* Clear indicator if active */}
                              {chocFilter && (
                                <button
                                  onClick={() => setChocFilter('')}
                                  className="text-red-500 hover:scale-110 transition-transform ml-0.5"
                                  title="Clear filter"
                                >
                                  <X size={12} strokeWidth={3} />
                                </button>
                              )}
                            </div>
                          </th>
                          <th className="py-3 px-4 font-bold text-center align-top min-w-[100px]">
                            <div className="flex items-center justify-center gap-1">
                              <span>Count</span>
                              <div className="relative inline-flex items-center justify-center w-5 h-5 hover:bg-amber-200 rounded-md cursor-pointer transition-colors" title="Filter by Count">
                                <Filter size={14} className={countFilter !== 'All' ? 'text-amber-800' : 'text-amber-400'} />
                                <select
                                  value={countFilter}
                                  onChange={(e) => setCountFilter(e.target.value)}
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                >
                                  <option value="All">All</option>
                                  {uniqueCounts.map(c => (
                                    <option key={c} value={c.toString()}>{c}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </th>

                          {!isScreenshotMode && <th className="py-3 px-4 font-bold text-right align-top min-w-[110px]">{activeTab === 'dashboard2' ? 'Prod. Price' : 'Choc. Price'}</th>}
                          {!isScreenshotMode && !hiddenCols.deliveryCharge && (
                            <th className="py-3 px-4 font-bold text-right align-top transition-all duration-300 min-w-[120px]">
                              <div className="flex items-center justify-end gap-1 group">
                                <span className="whitespace-nowrap">Delivery Charge</span>
                              </div>
                            </th>
                          )}
                          {!isScreenshotMode && <th className="py-3 px-4 font-bold text-center align-top min-w-[100px]">Advance</th>}
                          {!isScreenshotMode && !hiddenCols.discount && (
                            <th className="py-3 px-4 font-bold text-center align-top print:hidden transition-all duration-300 min-w-[100px]">
                              <div className="flex items-center justify-center gap-1 group">
                                <span className="whitespace-nowrap">Discount</span>
                              </div>
                            </th>
                          )}

                          {/* 🟢 PENDING AMOUNT HEADER (Screenshot) / TOTAL AMOUNT HEADER (Normal) */}
                          <th className="py-3 px-4 font-bold text-center align-top min-w-[120px]">
                            <span className="whitespace-nowrap">{isScreenshotMode ? 'Pending Amount' : 'Total Amount'}</span>
                          </th>

                          {/* 🟢 LOCATION HEADER (Screenshot) / PAYMENT STATUS HEADER (Normal) */}
                          <th className="py-3 px-4 font-bold text-center align-top min-w-[140px]">
                            <div className="flex items-center justify-center gap-1 group">
                              <span>{isScreenshotMode ? 'Location' : 'Payment Status'}</span>
                              {!isScreenshotMode && (
                                <div className="relative inline-flex items-center justify-center w-5 h-5 hover:bg-amber-200 rounded-md cursor-pointer transition-colors" title="Filter by Payment Status">
                                  <ChevronDown size={14} className={paymentFilter !== 'All' ? 'text-amber-800 font-bold' : 'text-amber-400'} />
                                  <select
                                    value={paymentFilter}
                                    onChange={(e) => setPaymentFilter(e.target.value as any)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                  >
                                    <option value="All">All Payments</option>
                                    <option value="Full Paid">Paid (Full)</option>
                                    <option value="Partially Paid">Partial</option>
                                    <option value="Pending">Pending</option>
                                  </select>
                                </div>
                              )}
                            </div>
                          </th>
                          {!isScreenshotMode && (
                            <th className="py-3 px-4 font-bold text-center align-top min-w-[140px]">
                              <div className="flex items-center justify-center gap-1 group">
                                <span>Delivery Status</span>
                                <div className="relative inline-flex items-center justify-center w-5 h-5 hover:bg-amber-200 rounded-md cursor-pointer transition-colors" title="Filter by Delivery Status">
                                  <ChevronDown size={14} className={deliveryFilter !== 'All' ? 'text-amber-800 font-bold' : 'text-amber-400'} />
                                  <select
                                    value={deliveryFilter}
                                    onChange={(e) => setDeliveryFilter(e.target.value as any)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                  >
                                    <option value="All">All Deliveries</option>
                                    <option value="Delivered">Delivered</option>
                                    <option value="In Process">In Process</option>
                                  </select>
                                </div>
                              </div>
                            </th>
                          )}

                          {!isScreenshotMode && (
                            <th className="py-3 px-4 font-bold text-center print:hidden align-top min-w-[110px] sticky-actions-col">
                              <div className="flex items-center justify-center gap-2">
                                <button onClick={jumpToSerial} className="p-1 hover:bg-amber-100 rounded-full text-amber-600 transition-colors shadow-sm bg-white border border-amber-100" title="Jump to Serial No">
                                  <ChevronLeft size={14} strokeWidth={3} />
                                </button>
                                <span>Actions</span>
                              </div>
                            </th>
                          )}
                        </tr>
                        )}
                      </thead>
                      <tbody>
                        {(isScreenshotMode ? screenshotChunkOrders : paginatedOrders).length === 0 ? (
                          <tr><td colSpan={20} className="p-8 text-center text-amber-400 font-extrabold text-sm tracking-wide bg-[#0d1527]">No records found for the selected filters.</td></tr>
                        ) : (
                          (isScreenshotMode ? screenshotChunkOrders : paginatedOrders).map((order, idx) => {
                            const priceData = calculatePriceInfo(order.chocolate, order.count, order.discount, order.isDeliveryFree, order.paymentStatus, order.category, customPricesMap, order.manualDeliveryFee, order.orderStatus, managedChocPricesMap, order.pricingType, order.manualProductPrice);
                            const isSelected = selectedOrders.includes(order.id);

                            if (isScreenshotMode) {
                              const pendingAmt = order.paymentStatus === 'Full Paid'
                                ? 0
                                : order.paymentStatus === 'Partially Paid'
                                  ? Math.max(0, priceData.fullTotalPrice - Number(order.advanceAmount || 0))
                                  : priceData.fullTotalPrice;
                              return (
                                <tr key={order.fireId || order.id} className={`border-b border-white/10 ${idx % 2 === 0 ? 'bg-[#0d1527]' : 'bg-[#121c33]'}`}>
                                  <td className="py-2.5 pl-5 pr-2 font-extrabold text-amber-300 text-xs align-middle w-[220px] min-w-[220px] whitespace-nowrap">{order.name}</td>
                                  <td className="py-2.5 px-2 font-bold text-white text-xs align-middle w-[120px] min-w-[120px] whitespace-nowrap">{order.deliveryDate || order.functionDate || order.orderDate || "-"}</td>
                                  <td className="py-2.5 px-2 align-middle text-center w-[240px] min-w-[240px] text-xs">{renderChocolateBadges(order.chocolate)}</td>
                                  <td className="py-2.5 px-2 text-center font-bold text-amber-200 text-xs align-middle w-[80px] min-w-[80px]">{order.count}</td>
                                  <td className="py-2.5 px-2 text-center align-middle font-black text-xs screenshot-pending-amount w-[170px] min-w-[170px]">
                                    {pendingAmt > 0 ? <span className="text-rose-400 font-bold text-xs">₹{pendingAmt.toLocaleString()}</span> : <span className="text-emerald-400 font-bold text-xs">₹0</span>}
                                  </td>
                                  <td className="py-2.5 px-2 text-center align-middle font-bold text-slate-100 text-xs w-[150px] min-w-[150px]">
                                    <div className="flex flex-col items-center justify-center">
                                      {renderScreenshotLocation(order)}
                                    </div>
                                  </td>
                                </tr>
                              );
                            }

                            return (
                              <tr key={order.fireId || order.id} className={`border-b transition-colors border-amber-50 hover:bg-orange-50/50 print:border-gray-200 ${isSelected ? 'bg-amber-50/80 print:bg-transparent' : ''}`}>
                                {!isScreenshotMode && showCheckboxes && (
                                  <td className="py-2.5 px-4 text-center print:hidden align-middle">
                                    <input type="checkbox" checked={isSelected} onChange={() => { if (selectedOrders.includes(order.id)) setSelectedOrders(selectedOrders.filter(x => x !== order.id)); else setSelectedOrders([...selectedOrders, order.id]); }} className="w-4 h-4 cursor-pointer accent-amber-600 rounded" />
                                  </td>
                                )}
                                {!isScreenshotMode && !hiddenCols.serialNo && (
                                  <td className="py-2.5 px-4 font-extrabold text-amber-900 print:text-black align-middle whitespace-nowrap transition-all duration-300">
                                    <div className="flex items-center gap-2">
                                      <div className="w-8 shrink-0 print:hidden" />
                                      <span>{getSerial(order.id)}</span>
                                    </div>
                                  </td>
                                )}
                                {!isScreenshotMode && !hiddenCols.role && (
                                  <td className="py-2.5 px-4 align-middle transition-all duration-300">
                                    <div className="flex items-center justify-start gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const nextRole = order.role === 'Others' ? 'Self' : 'Others';
                                          handleRoleUpdate(order.id, order.fireId, nextRole);
                                        }}
                                        className={`relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${(order.role === 'Others') ? 'bg-green-500' : 'bg-rose-500'}`}
                                        title={`Click to change to ${order.role === 'Others' ? 'Self' : 'Others'}`}
                                      >
                                        <span
                                          className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${(order.role === 'Others') ? 'translate-x-3' : 'translate-x-0'}`}
                                        />
                                      </button>
                                      <span className={`text-[10px] font-black uppercase tracking-wider ${(order.role === 'Others') ? 'text-green-600' : 'text-rose-600'}`}>
                                        {order.role}
                                      </span>
                                    </div>
                                  </td>
                                )}
                                {!isScreenshotMode && !hiddenCols.orderDate && (
                                  <td className="py-2.5 px-4 font-medium text-[#5d4037] align-middle transition-all duration-300">
                                    {order.orderDate}
                                  </td>
                                )}

                                <td className={`py-2.5 px-4 font-bold align-middle ${isScreenshotMode ? 'text-white font-extrabold text-sm min-w-[200px]' : order.orderType === 'Thaaru' ? 'font-extrabold print:text-black' : 'text-amber-950 print:text-black'}`}>
                                  <span className={order.orderType === 'Thaaru' ? 'text-[#38bdf8] font-black' : ''} title={order.orderType === 'Thaaru' ? 'Thaaru Order' : ''}>{order.name}</span>
                                </td>

                                {!isScreenshotMode && (
                                  <td className="py-2.5 px-4 text-center align-middle">
                                    {(() => {
                                      const rawLoc = String((order as any).location || '').trim();
                                      const addrStr = String((order as any).address || '').trim();
                                      const remStr = String((order as any).remarks || (order as any).comments || '').trim();
                                      const combined = `${rawLoc} ${addrStr} ${remStr}`.trim();
                                      const lower = combined.toLowerCase();

                                      if ((order as any).isChennai === true || rawLoc.toLowerCase() === 'chennai' || lower.includes('chennai') || lower.includes('madras')) {
                                        return <span className="font-extrabold text-emerald-400">Chennai</span>;
                                      }

                                      if (rawLoc.toLowerCase() === 'kerala' || lower.includes('kerala') || lower.includes('kochi') || lower.includes('trivandrum') || lower.includes('ernakulam') || lower.includes('calicut')) {
                                        return <span className="font-extrabold text-purple-400">Kerala</span>;
                                      }

                                      const knownCities = [
                                        'Madurai', 'Coimbatore', 'Trichy', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 
                                        'Erode', 'Vellore', 'Thanjavur', 'Tuticorin', 'Thoothukudi', 'Nagercoil', 
                                        'Kanyakumari', 'Dindigul', 'Karur', 'Cuddalore', 'Kanchipuram', 'Tiruppur', 
                                        'Hosur', 'Puducherry', 'Pondicherry', 'Karaikal', 'Ramanathapuram', 'Ramnad', 
                                        'Virudhunagar', 'Sivakasi', 'Tenkasi', 'Namakkal', 'Villupuram'
                                      ];

                                      for (const city of knownCities) {
                                        if (lower.includes(city.toLowerCase())) {
                                          return <span className="font-extrabold text-sky-400">{city}</span>;
                                        }
                                      }

                                      if (rawLoc && rawLoc.toLowerCase() !== 'others') {
                                        return <span className="font-extrabold text-slate-200">{rawLoc}</span>;
                                      }

                                      return <span className="text-slate-400 font-bold text-sm">—</span>;
                                    })()}
                                  </td>
                                )}

                                {!isScreenshotMode && (
                                  <td className="py-2.5 px-4 font-medium text-amber-800 print:text-gray-800 align-middle">
                                    <div className="flex flex-col items-start gap-1">
                                      <span className="font-extrabold text-white text-sm tracking-wide">{formatPhoneNumber(order.phone)}</span>
                                      {activeTab === 'dashboard1' && (() => {
                                        const phoneKey = normalizePhone(order.phone);
                                        if (!phoneKey || !duplicatePhoneCounts[phoneKey] || duplicatePhoneCounts[phoneKey].count <= 1) return null;

                                        const isIgnored = ignoredDuplicatePhones.includes(phoneKey);
                                        const dupCount = duplicatePhoneCounts[phoneKey].count;

                                        return (
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <button
                                                type="button"
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black tracking-wide transition-all shadow-md border cursor-pointer ${
                                                  isIgnored
                                                    ? 'bg-slate-800 text-slate-100 border-slate-600 hover:bg-slate-700 hover:text-white'
                                                    : 'bg-amber-400 text-slate-950 border-amber-300 hover:bg-amber-300 animate-pulse'
                                                }`}
                                                title={isIgnored ? "Duplicate ignored" : `${dupCount} orders found with this phone number`}
                                              >
                                                <span className={isIgnored ? "text-slate-100 font-black" : "text-slate-950 font-black"}>
                                                  {isIgnored ? '⚪ Ignored' : `⚠️ Duplicate (${dupCount})`}
                                                </span>
                                                <ChevronDown size={11} className={isIgnored ? "text-slate-300" : "text-slate-950"} />
                                              </button>
                                            </PopoverTrigger>
                                            <PopoverContent align="start" className="w-60 p-3 bg-slate-900 text-white border border-white/20 shadow-2xl rounded-xl text-xs z-[150]">
                                              <div className="pb-2 mb-2 border-b border-white/10">
                                                <div className="flex items-center justify-between">
                                                  <span className="font-extrabold text-amber-400 text-xs flex items-center gap-1">
                                                    {isIgnored ? '⚪ Ignored Duplicate' : '⚠️ Duplicate Contact'}
                                                  </span>
                                                  <span className="bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0.5 rounded font-black">
                                                    {dupCount} Orders
                                                  </span>
                                                </div>
                                                <p className="text-[11px] text-slate-300 font-mono mt-0.5">
                                                  {formatPhoneNumber(order.phone)}
                                                </p>
                                                <div className="text-[10px] text-slate-400 mt-1 max-h-16 overflow-y-auto custom-scrollbar">
                                                  Orders by: {duplicatePhoneCounts[phoneKey].orders.map(o => o.name).filter(Boolean).join(', ')}
                                                </div>
                                              </div>
                                              <div className="space-y-1">
                                                <button
                                                  type="button"
                                                  onClick={() => handleToggleIgnoreDuplicatePhone(phoneKey)}
                                                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-bold flex items-center justify-between transition-colors cursor-pointer text-white"
                                                >
                                                  <span>{isIgnored ? '✅ Restore Warning' : '🚫 Ignore Duplicate'}</span>
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setD1DuplicateFilter('Duplicates Only');
                                                    setD1DashboardSearch(formatPhoneNumber(order.phone));
                                                  }}
                                                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-bold flex items-center gap-2 transition-colors text-amber-300 cursor-pointer"
                                                >
                                                  <Search size={12} />
                                                  <span>View All {dupCount} Orders</span>
                                                </button>
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    const cleanDigits = phoneKey.replace(/\D/g, '');
                                                    window.open(`https://wa.me/91${cleanDigits}`, '_blank');
                                                  }}
                                                  className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-white/10 text-xs font-bold flex items-center gap-2 transition-colors text-emerald-400 cursor-pointer"
                                                >
                                                  <MessageCircle size={12} />
                                                  <span>WhatsApp Customer</span>
                                                </button>
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                        );
                                      })()}
                                    </div>
                                  </td>
                                )}
                                {!isScreenshotMode && <td className={`py-2.5 px-4 font-medium text-amber-800 print:text-gray-800 align-middle`}>{order.functionDate}</td>}
                                <td className={`py-2.5 px-4 font-bold text-orange-900 print:text-black align-middle`}>{order.deliveryDate || order.functionDate || order.orderDate || "-"}</td>

                                {/* ORDER STATUS removed from Dashboard 2 */}

                                <td className={`py-2.5 px-4 print:text-gray-800 align-middle text-center`}>
                                  {renderChocolateBadges(order.chocolate)}
                                </td>

                                <td className={`py-2.5 px-4 text-center font-bold text-amber-950 print:text-black align-middle`}>
                                  {order.count}
                                </td>

                                {!isScreenshotMode && (
                                  <td className="py-2.5 px-3 text-right print:text-black align-middle">
                                    <div className="font-medium text-amber-900">₹{priceData.chocolatePrice.toLocaleString()}</div>
                                  </td>
                                )}

                                {!isScreenshotMode && !hiddenCols.deliveryCharge && (
                                  <td className="py-2.5 px-4 text-right font-medium text-amber-900 align-middle transition-all duration-300">
                                    {order.isDeliveryFree ? <span className="text-green-600 font-black">Free</span> : `₹${priceData.fullDeliveryCharge.toLocaleString()}`}
                                  </td>
                                )}

                                {!isScreenshotMode && (
                                  <td className="py-2.5 px-4 text-center align-middle">
                                    <input
                                      type="number"
                                      placeholder="0"
                                      value={order.advanceAmount || ''}
                                      onChange={(e) => handleAdvanceUpdate(order.id, order.fireId, e.target.value)}
                                      className="w-20 p-1.5 border border-emerald-300 rounded text-center text-sm font-bold text-emerald-950 bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                  </td>
                                )}

                                {!isScreenshotMode && !hiddenCols.discount && (
                                  <td className="py-2.5 px-4 text-center print:hidden align-middle transition-all duration-300">
                                    <input
                                      type="number"
                                      list="discount-suggestions"
                                      placeholder="0"
                                      value={order.discount || ''}
                                      onChange={(e) => handleDiscountUpdate(order.id, order.fireId, e.target.value)}
                                      className="w-20 p-1.5 border border-amber-300 rounded text-center text-sm font-bold text-amber-950 bg-white outline-none focus:ring-2 focus:ring-amber-500"
                                    />
                                  </td>
                                )}


                                {isScreenshotMode ? (
                                  /* 📸 Screenshot: Show PENDING AMOUNT only */
                                  <td className="py-2.5 px-4 text-center align-middle font-bold text-amber-950 text-lg screenshot-pending-amount">
                                    {(() => {
                                      const pendingAmt = order.paymentStatus === 'Full Paid'
                                        ? 0
                                        : order.paymentStatus === 'Partially Paid'
                                          ? Math.max(0, priceData.fullTotalPrice - Number(order.advanceAmount || 0))
                                          : priceData.fullTotalPrice;
                                      return pendingAmt > 0
                                        ? <span className="screenshot-pending-value">₹{pendingAmt.toLocaleString()}</span>
                                        : <span className="screenshot-pending-zero">₹0</span>;
                                    })()}
                                  </td>
                                ) : (
                                  <td className={`py-2.5 px-4 text-right align-middle`}>
                                    <div className="font-bold text-white text-base print:text-black">₹{priceData.fullTotalPrice.toLocaleString()}</div>
                                    {order.paymentStatus === 'Pending' && (
                                      <div className="text-[11px] font-extrabold text-rose-400 leading-tight mt-0.5">Pending: ₹{priceData.fullTotalPrice.toLocaleString()}</div>
                                    )}
                                    {order.paymentStatus === 'Partially Paid' && (
                                      <>
                                        <div className="text-[11px] font-extrabold text-emerald-400 leading-tight mt-0.5">Paid: ₹{Number(order.advanceAmount || 0).toLocaleString()}</div>
                                        <div className="text-[11px] font-extrabold text-amber-400 leading-tight">Pending: ₹{(priceData.fullTotalPrice - Number(order.advanceAmount || 0)).toLocaleString()}</div>
                                      </>
                                    )}
                                  </td>
                                )}

                                <td className="py-2.5 px-4 text-center align-middle">
                                    {isScreenshotMode ? (
                                       /* 📸 Screenshot: Show exact LOCATION specified in the order as plain text */
                                       <div className="flex flex-col items-center">
                                         {(() => {
                                           const rawLoc = String((order as any).location || '').trim();
                                           const addrStr = String((order as any).address || '').trim();
                                           const remStr = String((order as any).remarks || (order as any).comments || '').trim();
                                           const combined = `${rawLoc} ${addrStr} ${remStr}`.trim();
                                           const lower = combined.toLowerCase();

                                           if ((order as any).isChennai === true || lower.includes('chennai') || lower.includes('madras')) {
                                             return <span className="screenshot-location-text screenshot-location-chennai font-bold">Chennai</span>;
                                           }
                                           if (lower.includes('kerala') || lower.includes('kochi') || lower.includes('trivandrum') || lower.includes('ernakulam') || lower.includes('calicut')) {
                                             return <span className="screenshot-location-text screenshot-location-kerala font-bold">Kerala</span>;
                                           }

                                           const knownCities = [
                                             'Madurai', 'Coimbatore', 'Trichy', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 
                                             'Erode', 'Vellore', 'Thanjavur', 'Tuticorin', 'Thoothukudi', 'Nagercoil', 
                                             'Kanyakumari', 'Dindigul', 'Karur', 'Cuddalore', 'Kanchipuram', 'Tiruppur', 
                                             'Hosur', 'Puducherry', 'Pondicherry', 'Karaikal', 'Ramanathapuram', 'Ramnad', 
                                             'Virudhunagar', 'Sivakasi', 'Tenkasi', 'Namakkal', 'Villupuram'
                                           ];

                                           for (const city of knownCities) {
                                             if (lower.includes(city.toLowerCase())) {
                                               return <span className="screenshot-location-text screenshot-location-others font-bold">{city}</span>;
                                             }
                                           }

                                           if (rawLoc) {
                                             return <span className="screenshot-location-text screenshot-location-others font-bold">{rawLoc}</span>;
                                           }
                                           if (addrStr) {
                                             const shortAddr = addrStr.length > 15 ? `${addrStr.substring(0, 15)}...` : addrStr;
                                             return <span className="screenshot-location-text screenshot-location-others font-bold">{shortAddr}</span>;
                                           }
                                           return <span className="screenshot-location-text screenshot-location-empty font-bold">—</span>;
                                         })()}
                                       </div>
                                    ) : (
                                    <div className="flex flex-col items-center gap-1">
                                      <div className="print:hidden">
                                        <select
                                          value={order.paymentStatus || "Pending"}
                                          onChange={(e) => handlePaymentStatusUpdate(order.id, order.fireId, e.target.value)}
                                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 outline-none cursor-pointer transition-colors shadow-sm min-w-[125px] ${order.paymentStatus === 'Full Paid'
                                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 focus:ring-2 focus:ring-emerald-400 payment-badge-full-paid'
                                            : order.paymentStatus === 'Partially Paid'
                                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 focus:ring-2 focus:ring-amber-400 payment-badge-partially-paid'
                                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30 focus:ring-2 focus:ring-rose-400 payment-badge-pending'
                                            }`}
                                        >
                                          <option value="Full Paid" className="font-bold text-emerald-400 bg-[#0d1527]">Full Paid</option>
                                          <option value="Partially Paid" className="font-bold text-amber-400 bg-[#0d1527]">Partially Paid</option>
                                          <option value="Pending" className="font-bold text-rose-400 bg-[#0d1527]">Pending</option>
                                        </select>
                                      </div>
                                      <span className="hidden print:inline text-sm font-bold text-black">{order.paymentStatus || 'Pending'}</span>

                                      {order.paymentStatus === 'Partially Paid' && (
                                        <span className="text-[10px] font-extrabold text-amber-400 whitespace-nowrap mt-0.5">
                                          Pending: ₹{(priceData.fullTotalPrice - Number(order.advanceAmount || 0)).toLocaleString()}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>

                                {!isScreenshotMode && (
                                  <td className="py-2.5 px-4 text-center align-middle">
                                    <div className="print:hidden">
                                      <select
                                        value={order.status}
                                        onChange={(e) => handleDeliveryStatusUpdate(order.id, order.fireId, e.target.value)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border outline-none cursor-pointer transition-colors shadow-sm min-w-[115px] ${order.status === 'Delivered'
                                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30 focus:ring-2 focus:ring-emerald-400 status-badge-delivered'
                                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30 focus:ring-2 focus:ring-amber-400 status-badge-in-process'
                                          }`}
                                      >
                                        <option value="Delivered" className="font-bold text-emerald-400 bg-[#0d1527]">Delivered</option>
                                        <option value="In Process" className="font-bold text-amber-400 bg-[#0d1527]">In Process</option>
                                      </select>
                                    </div>
                                    <span className="hidden print:inline text-sm font-bold text-black">{order.status}</span>
                                  </td>
                                )}

                                {!isScreenshotMode && (
                                  <td className="py-2.5 px-4 print:hidden align-middle text-center relative sticky-actions-col">
                                    <div className="flex items-center justify-center gap-1">
                                      <button
                                        onClick={() => setOpenActionId(openActionId === order.id ? null : order.id)}
                                        className="p-2 text-amber-400 hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                                        title="Actions Menu"
                                      >
                                        <MoreVertical size={20} />
                                      </button>
                                    </div>

                                    {openActionId === order.id && (
                                      <>
                                        <div className="fixed inset-0 z-[90]" onClick={() => setOpenActionId(null)}></div>

                                        <div
                                          style={{
                                            backgroundColor: '#0d1527',
                                            border: '2px solid rgba(245, 158, 11, 0.45)',
                                            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.85)'
                                          }}
                                          className="action-menu-popup absolute right-14 top-2 z-[100] rounded-[1.5rem] p-2.5 flex gap-2 animate-in slide-in-from-right-5 duration-200"
                                        >
                                          <button onClick={() => { setHistoryDetailOrder(order); setOpenActionId(null); }} className="text-sky-400 hover:text-sky-300 hover:scale-125 p-2 rounded-xl transition-all hover:bg-sky-500/20 cursor-pointer" title="View Detailed Record"><Eye size={20} /></button>
                                          <button onClick={() => { handleSendSMS(order); setOpenActionId(null); }} className="text-indigo-400 hover:text-indigo-300 hover:scale-125 p-2 rounded-xl transition-all hover:bg-indigo-500/20 cursor-pointer" title="Send SMS Bill"><MessageSquare size={20} /></button>
                                          <button onClick={() => { setShippingOrder(order); setIsShippingOpen(true); setOpenActionId(null); }} className="text-purple-400 hover:text-purple-300 hover:scale-125 p-2 rounded-xl transition-all hover:bg-purple-500/20 cursor-pointer" title="Shipping"><Truck size={20} /></button>
                                          <button onClick={() => { handleEditClick(order); setOpenActionId(null); }} className="text-emerald-400 hover:text-emerald-300 hover:scale-125 p-2 rounded-xl transition-all hover:bg-emerald-500/20 cursor-pointer" title="Edit Order"><Pencil size={20} /></button>
                                          <button onClick={() => { handleDeleteClick(order.id); setOpenActionId(null); }} className="text-rose-500 hover:text-rose-400 hover:scale-125 p-2 rounded-xl transition-all hover:bg-rose-500/20 cursor-pointer" title="Delete Order"><Trash2 size={20} /></button>
                                          <button onClick={() => { setSelectedOrderForInvoice(order); setIsInvoiceOpen(true); setOpenActionId(null); }} className="text-amber-400 hover:text-amber-300 hover:scale-125 p-2 rounded-xl transition-all hover:bg-amber-500/20 cursor-pointer" title="View Receipt"><Receipt size={20} /></button>
                                          <button onClick={() => { handleWhatsAppClick(order); setOpenActionId(null); }} className="text-green-400 hover:text-green-300 hover:scale-125 p-2 rounded-xl transition-all hover:bg-green-500/20 cursor-pointer" title="Share on WhatsApp"><MessageCircle size={20} /></button>
                                        </div>
                                      </>
                                    )}
                                  </td>
                                )}

                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* 🟢 STICKY PAGINATION FOOTER */}
                  <div className={`${isScreenshotMode ? 'hidden' : 'sticky bottom-0 z-30 bg-[#0d1527] backdrop-blur-md border-t border-white/10 p-4 flex justify-between items-center shadow-2xl'} print:hidden`}>
                    <div className="text-sm font-bold text-slate-300">
                      Showing <span className="font-black text-amber-400">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-black text-amber-400">{Math.min((currentPage - 1) * itemsPerPage + continuousVisibleCount, sortedDashboardOrders.length)}</span> of <span className="font-black text-amber-400">{sortedDashboardOrders.length}</span> orders
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        disabled={currentPage === 1}
                        onClick={() => {
                          setCurrentPage(prev => Math.max(1, prev - 1));
                          setContinuousVisibleCount(itemsPerPage);
                          tableContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`p-2 rounded-xl border transition-all ${currentPage === 1 ? 'bg-[#131c2e]/40 border-white/5 text-slate-600 cursor-not-allowed' : 'bg-[#131c2e] border-white/15 text-amber-400 hover:bg-[#18243b] active:scale-95 shadow-md cursor-pointer'}`}
                      >
                        <ChevronLeft size={20} />
                      </button>

                      {Math.ceil(sortedDashboardOrders.length / itemsPerPage) > 0 && (
                        <div className="flex items-center gap-1 bg-[#131c2e] p-1 rounded-xl border border-white/10">
                          {Array.from({ length: Math.ceil(sortedDashboardOrders.length / itemsPerPage) }).map((_, i) => {
                            const pageNum = i + 1;
                            // Logic to show limited page numbers
                            if (pageNum === 1 || pageNum === Math.ceil(sortedDashboardOrders.length / itemsPerPage) || (pageNum >= currentPage - 1 && pageNum <= currentPage + 1)) {
                              return (
                                <button
                                  key={pageNum}
                                  onClick={() => {
                                    setCurrentPage(pageNum);
                                    setContinuousVisibleCount(itemsPerPage);
                                    tableContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                                  }}
                                  className={`w-10 h-10 rounded-lg font-black transition-all cursor-pointer ${currentPage === pageNum ? 'bg-amber-500 text-slate-950 shadow-md scale-105' : 'bg-[#0d1527] text-slate-300 hover:bg-[#18243b]'}`}
                                >
                                  {pageNum}
                                </button>
                              );
                            }
                            if (pageNum === currentPage - 2 || pageNum === currentPage + 2) return <span key={pageNum} className="px-1 text-amber-400 font-black">...</span>;
                            return null;
                          })}
                        </div>
                      )}

                      <button
                        disabled={currentPage >= Math.ceil(sortedDashboardOrders.length / itemsPerPage)}
                        onClick={() => {
                          setCurrentPage(prev => prev + 1);
                          setContinuousVisibleCount(itemsPerPage);
                          tableContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`p-2 rounded-xl border transition-all ${currentPage >= Math.ceil(sortedDashboardOrders.length / itemsPerPage) ? 'bg-[#131c2e]/40 border-white/5 text-slate-600 cursor-not-allowed' : 'bg-[#131c2e] border-white/15 text-amber-400 hover:bg-[#18243b] active:scale-95 shadow-md cursor-pointer'}`}
                      >
                        <ChevronRight size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tracking' && (
            <div className="w-full px-2 print:hidden">
              <div className="bg-[#ebe6df] p-6 rounded-[2rem] shadow-[6px_6px_12px_rgba(0,0,0,0.1),-6px_-6px_12px_rgba(255,255,255,0.8)] border-2 border-white/40 mb-6">
                <div className="flex flex-col md:flex-row gap-4 items-center">
                  <div className="relative w-full md:w-2/5">
                    <Search className="absolute left-4 top-3.5 text-amber-500" size={20} />
                    <input
                      type="text"
                      placeholder="Search Customer..."
                      value={trkSearch}
                      onChange={(e) => setTrkSearch(e.target.value)}
                      className="w-full pl-12 pr-4 py-3 bg-white/70 border-2 border-white rounded-xl text-amber-950 font-bold placeholder-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.05)] text-sm"
                    />
                  </div>

                  <div className="flex flex-wrap flex-1 gap-3 w-full justify-end">
                    <select value={trkOrderStatusFilter} onChange={(e) => setTrkOrderStatusFilter(e.target.value)} className="flex-1 md:flex-none px-3 py-3 border-2 border-white rounded-xl text-xs font-bold text-amber-950 outline-none focus:ring-2 focus:ring-purple-400 bg-white/70 cursor-pointer shadow-[inset_2px_2px_5px_rgba(0,0,0,0.05)] uppercase tracking-wider">
                      <option value="All">All Statuses</option>
                      <option value="image edited (not paid)">I E (Not Paid)</option>
                      <option value="forward to print (paid)">F 2 P (Paid)</option>
                      <option value="order complete">Order Complete</option>
                      <option value="cancelled">Cancelled</option>
                    </select>


                    <select value={trkPaymentFilter} onChange={(e) => setTrkPaymentFilter(e.target.value as any)} className="flex-1 md:flex-none px-3 py-3 border-2 border-white rounded-xl text-sm font-bold text-amber-950 outline-none focus:ring-2 focus:ring-blue-400 bg-white/70 cursor-pointer shadow-[inset_2px_2px_5px_rgba(0,0,0,0.05)]">
                      <option value="All">All Payments</option>
                      <option value="Full Paid">Full Paid</option>
                      <option value="Partially Paid">Partially Paid</option>
                      <option value="Pending">Pending</option>
                    </select>

                    <select value={trkDeliveryFilter} onChange={(e) => setTrkDeliveryFilter(e.target.value as any)} className="flex-1 md:flex-none px-3 py-3 border-2 border-white rounded-xl text-sm font-bold text-amber-950 outline-none focus:ring-2 focus:ring-green-400 bg-white/70 cursor-pointer shadow-[inset_2px_2px_5px_rgba(0,0,0,0.05)]">
                      <option value="All">All Deliveries</option>
                      <option value="Delivered">Delivered</option>
                      <option value="In Process">In Process</option>
                    </select>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => document.getElementById('tracking-wallpaper-upload')?.click()}
                        className="flex justify-center items-center w-10 h-10 font-bold rounded-lg transition-colors border bg-white text-amber-900 border-amber-200 hover:bg-amber-50 cursor-pointer shadow-sm animate-in fade-in duration-300"
                        title="Set Background Wallpaper"
                      >
                        <ImageIcon size={18} className="text-amber-700" />
                      </button>
                      <input
                        type="file"
                        id="tracking-wallpaper-upload"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleWallpaperUpload(e, 'tracking')}
                      />
                      {trackWallpaper && (
                        <button
                          onClick={() => handleClearWallpaper('tracking')}
                          className="w-10 h-10 flex justify-center items-center text-rose-600 hover:text-rose-800 hover:bg-rose-50 border border-rose-200 rounded-lg cursor-pointer bg-white shadow-sm animate-in fade-in duration-300"
                          title="Remove Background"
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4 pb-10">
                {trackingSearchResults.length === 0 ? (
                  <div
                    className={`text-center py-10 rounded-2xl transition-all duration-300 ${isWallpaperActive
                        ? 'bg-black/45 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.37)]'
                        : 'bg-white border border-amber-100 shadow-sm'
                      }`}
                  >
                    <p className={`font-bold tracking-wide ${isWallpaperActive ? 'text-white' : 'text-amber-700'}`}>
                      No tracking records found.
                    </p>
                  </div>
                ) : (
                  trackingSearchResults.map(order => {
                    const priceData = calculatePriceInfo(order.chocolate, order.count, order.discount, order.isDeliveryFree, order.paymentStatus, order.category, customPricesMap, order.manualDeliveryFee, order.orderStatus, managedChocPricesMap, order.pricingType, order.manualProductPrice);
                    return (

                      <div key={order.fireId || order.id} className="bg-[#ebe6df] rounded-3xl p-6 shadow-[6px_6px_12px_rgba(0,0,0,0.1),-6px_-6px_12px_rgba(255,255,255,0.8)] border-2 border-white/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:-translate-y-1 transition-all duration-300">
                        <div className="flex items-center gap-4">
                          <div className="w-14 h-14 bg-gradient-to-br from-amber-100 to-amber-200 text-amber-700 rounded-full flex items-center justify-center shrink-0 shadow-inner">
                            <Package size={28} />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-amber-950">{order.name}</h3>
                            <p className="text-sm font-medium text-amber-700 mb-1">
                              {formatPhoneNumber(order.phone)} • {order.count} Items • <span className="font-bold text-amber-900">₹{priceData.totalPrice}</span>
                            </p>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-amber-600">Item:</span>
                              {renderChocolateBadges(order.chocolate)}
                            </div>
                            {order.address && String(order.address).trim() !== "" && (
                              <div className="flex items-start gap-1.5 mt-1.5">
                                <span className="text-sm font-medium text-amber-600 mt-0.5">Address:</span>
                                <span className="address-badge text-xs font-bold text-amber-900 bg-amber-50/80 px-2 py-1 rounded border border-amber-200/50 break-words max-w-[200px] md:max-w-[280px]">
                                  {order.address}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="w-full md:w-auto flex-1 max-w-md mx-auto md:mx-0">
                          <div className="relative pt-6 pb-2">
                            <div className="flex items-center justify-between relative z-10">
                              <div className="flex flex-col items-center">
                                <div className="tracker-circle w-6 h-6 rounded-full bg-amber-500 text-white flex items-center justify-center text-xs border-4 border-white shadow-sm"><CheckCircle size={12} /></div>
                                <span className="text-xs font-bold text-amber-900 mt-2">Placed</span>
                              </div>
                              <div className={`flex-1 h-1 mx-2 rounded ${order.status === 'Delivered' ? 'bg-amber-500' : 'bg-amber-100'}`}></div>
                              <div className="flex flex-col items-center">
                                <div className={`tracker-circle w-6 h-6 rounded-full flex items-center justify-center text-xs border-4 border-white shadow-sm ${order.status === 'Delivered' ? 'bg-amber-500 text-white' : 'bg-amber-200 text-amber-700'}`}>{order.status === 'Delivered' ? <CheckCircle size={12} /> : <Clock size={12} />}</div>
                                <span className={`text-xs font-bold mt-2 ${order.status === 'Delivered' ? 'text-amber-900' : 'text-amber-600'}`}>Delivery</span>
                              </div>
                            </div>
                            <div className="text-center mt-3 text-sm font-bold text-amber-800">
                              Function: <span className="text-amber-950">{order.functionDate}</span> • Est. Delivery: <span className="text-amber-950">{order.deliveryDate || order.functionDate || order.orderDate || "-"}</span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 w-full md:w-auto text-right md:text-left mt-2 md:mt-0 flex flex-col gap-2">
                          <span className={`px-4 py-2 rounded-full text-sm font-bold border inline-block text-center ${order.status === 'Delivered' ? 'bg-[#e6f7ec] text-[#047857] border-[#9fe2bf] status-badge-delivered' : 'bg-[#fff7ed] text-[#d35400] border-[#fdba74] status-badge-in-process'}`}>
                            {order.status}
                          </span>
                          <span className={`px-4 py-1.5 rounded-full text-xs font-bold border inline-block text-center ${order.paymentStatus === 'Full Paid' ? 'bg-[#e6f7ec] text-[#047857] border-[#9fe2bf] payment-badge-full-paid' :
                            order.paymentStatus === 'Partially Paid' ? 'bg-[#fff7ed] text-[#d35400] border-[#fdba74] payment-badge-partially-paid' :
                              'bg-[#fee2e2] text-[#b91c1c] border-[#fca5a5] payment-badge-pending'
                            }`}>
                            {order.paymentStatus || 'Pending'}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}

          {activeTab === 'attendance' && (
            <div className="space-y-6 print:hidden">
              <AttendanceLog
                isAdminOverride={role === 'Admin'}
                onWallpaperChange={() => {
                  const activeUser = profile?.username || localStorage.getItem('loggedInName') || "";
                  const userWp = (activeUser && localStorage.getItem(`sabi_wallpaper_attendance_${activeUser}`)) || localStorage.getItem('sabi_wallpaper_attendance') || "";
                  setAttendanceWallpaper(userWp);
                }}
              />
            </div>
          )}

          {activeTab === 'reports' && (
            <div className="space-y-6 print:hidden">
              <div className="bg-[#ebe6df] p-4 rounded-2xl shadow-[6px_6px_12px_rgba(0,0,0,0.1),-6px_-6px_12px_rgba(255,255,255,0.8)] border-2 border-white/40 flex flex-wrap justify-between items-center gap-4">

                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-black text-[#3e2723] flex items-center gap-2">
                    <Calendar className="text-amber-700" /> Report Analytics
                  </h2>

                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <select
                        value={reportDashboardFilter}
                        onChange={(e) => setReportDashboardFilter(e.target.value)}
                        className="pl-3 pr-8 py-1.5 bg-white border border-[#d7ccc8] rounded-xl text-sm font-bold text-[#5d4037] outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-sm appearance-none"
                      >
                        <option value="All">All Dashboards</option>
                        <option value="Dashboard 1">Dashboard 1 (Choc)</option>
                        <option value="Dashboard 2">Dashboard 2 (Prod)</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-2.5 text-[#a46c3b] pointer-events-none" />
                    </div>

                    <div className="relative">
                      <select
                        value={reportOrderTypeFilter}
                        onChange={(e) => setReportOrderTypeFilter(e.target.value)}
                        className="pl-3 pr-8 py-1.5 bg-white border border-[#d7ccc8] rounded-xl text-sm font-bold text-[#5d4037] outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer shadow-sm appearance-none"
                      >
                        <option value="All">All Order Types</option>
                        {orderTypes.map((ot, idx) => {
                          const name = getOrderTypeName(ot);
                          const id = getOrderTypeId(ot, idx);
                          return (
                            <option key={id} value={name}>
                              {name}
                            </option>
                          );
                        })}
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-2.5 text-[#a46c3b] pointer-events-none" />
                    </div>

                    <button
                      onClick={() => setActiveTab('admin_panel' as any)}
                      className="p-1.5 bg-white border border-[#d7ccc8] hover:border-amber-500 hover:text-amber-700 rounded-xl text-[#5d4037] shadow-sm cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center justify-center h-[34px] w-[34px]"
                      title="Open Admin Cost Analytics"
                    >
                      <Settings size={16} strokeWidth={2.5} />
                    </button>

                    <button
                      onClick={() => {
                        setAnalyticsActiveTab('order_types');
                        setIsAnalyticsModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-extrabold text-xs rounded-xl shadow-md cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 h-[34px]"
                      title="Manage Order Types & Chocolates"
                    >
                      <Eye size={16} strokeWidth={2.5} />
                      <span className="font-black">Order Types & Chocs</span>
                    </button>

                    <button
                      onClick={() => {
                        setTempReportsPasscode(reportsPasscode);
                        setTempHistoryPasscode(historyPasscode);
                        setIsPasscodeSettingsOpen(true);
                      }}
                      className="p-1.5 bg-white border border-[#d7ccc8] hover:border-amber-500 hover:text-amber-700 rounded-xl text-[#5d4037] shadow-sm cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center justify-center h-[34px] w-[34px]"
                      title="Passcode Settings"
                    >
                      <Lock size={16} strokeWidth={2.5} />
                    </button>
                    <button
                      onClick={() => document.getElementById('reports-wallpaper-upload')?.click()}
                      className="p-1.5 bg-white border border-[#d7ccc8] hover:border-amber-500 hover:text-amber-700 rounded-xl text-[#5d4037] shadow-sm cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center justify-center h-[34px] w-[34px]"
                      title="Set Background Wallpaper"
                    >
                      <ImageIcon size={16} strokeWidth={2.5} />
                    </button>
                    <input
                      type="file"
                      id="reports-wallpaper-upload"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleWallpaperUpload(e, 'reports')}
                    />
                    {reportsWallpaper && (
                      <button
                        onClick={() => handleClearWallpaper('reports')}
                        className="p-1.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl shadow-sm cursor-pointer transition-all hover:scale-105 active:scale-95 flex items-center justify-center h-[34px] w-[34px] animate-in fade-in duration-300"
                        title="Remove Background"
                      >
                        <X size={16} strokeWidth={2.5} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-300">
                  {/* From Date Popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-2 bg-[#131c2e] hover:bg-[#18243b] px-3.5 py-2 rounded-xl border border-white/15 text-xs text-white font-extrabold shadow-sm transition-all cursor-pointer">
                        <Calendar size={14} className="text-amber-400 shrink-0" />
                        <span className="text-slate-400">From:</span>
                        <span className="text-amber-300 font-mono font-black">
                          {reportDateRange.start ? format(new Date(reportDateRange.start), "dd MMM yyyy") : "Select Date"}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="sabi-calendar-popover p-3 border border-white/20 bg-[#0c1427] text-white shadow-2xl rounded-2xl w-auto" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={reportDateRange.start ? new Date(reportDateRange.start) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            setReportDateRange({ ...reportDateRange, start: format(date, "yyyy-MM-dd") });
                          }
                        }}
                        className="rounded-xl border-none"
                      />
                    </PopoverContent>
                  </Popover>

                  {/* To Date Popover */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <button className="flex items-center gap-2 bg-[#131c2e] hover:bg-[#18243b] px-3.5 py-2 rounded-xl border border-white/15 text-xs text-white font-extrabold shadow-sm transition-all cursor-pointer">
                        <Calendar size={14} className="text-amber-400 shrink-0" />
                        <span className="text-slate-400">To:</span>
                        <span className="text-amber-300 font-mono font-black">
                          {reportDateRange.end ? format(new Date(reportDateRange.end), "dd MMM yyyy") : "Select Date"}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="sabi-calendar-popover p-3 border border-white/20 bg-[#0c1427] text-white shadow-2xl rounded-2xl w-auto" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={reportDateRange.end ? new Date(reportDateRange.end) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            setReportDateRange({ ...reportDateRange, end: format(date, "yyyy-MM-dd") });
                          }
                        }}
                        className="rounded-xl border-none"
                      />
                    </PopoverContent>
                  </Popover>

                  {(reportDateRange.start || reportDateRange.end) && (
                    <button
                      onClick={() => setReportDateRange({ start: "", end: "" })}
                      className="text-red-400 hover:text-red-300 font-extrabold text-xs cursor-pointer bg-red-950/40 hover:bg-red-900/60 px-3 py-2 rounded-xl border border-red-500/30 transition-colors"
                    >
                      Clear
                    </button>
                  )}

                  <button onClick={() => setIsReportPreviewOpen(true)} className="flex items-center gap-2 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black px-4 py-2 rounded-xl font-black text-xs shadow-md transition-transform hover:scale-105 cursor-pointer">
                    <Eye size={16} /> Preview Report
                  </button>
                  <button onClick={() => setIsProfitModalOpen(true)} className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white px-4 py-2 rounded-xl font-black text-xs shadow-md transition-transform hover:scale-105 cursor-pointer">
                    Profit Table
                  </button>
                </div>

              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                <div className="lg:col-span-2 space-y-6">

                  <div style={{ backgroundColor: '#0d1527', color: '#ffffff' }} className="bg-[#0d1527] p-6 rounded-3xl shadow-2xl border border-amber-500/35">
                    <div className="flex justify-between items-center mb-6">
                      <h2 className="text-xl font-black text-amber-400 flex items-center gap-2 uppercase tracking-wide">
                        <TrendingUp className="text-amber-400" /> Top Selling {reportDashboardFilter === 'Dashboard 2' ? 'Products' : 'Chocolates'}
                      </h2>
                    </div>
                    <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
                      {reportData.topChocs.length === 0 ? (
                        <p className="text-amber-400 font-extrabold text-sm">No sales data in this date range.</p>
                      ) : (
                        reportData.topChocs.map(([name, count], index) => (
                          <div key={index} style={{ backgroundColor: '#131c2e' }} className="flex items-center justify-between p-3.5 bg-[#131c2e] hover:bg-[#18243b] rounded-2xl border border-white/10 shadow-md transition-all">
                            <div className="flex items-center gap-3.5">
                              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-black font-black flex items-center justify-center text-xs shadow-md">
                                #{index + 1}
                              </div>
                              <span className="font-extrabold text-white text-base break-words max-w-[320px]" title={name}>{name}</span>
                            </div>
                            <span className="font-black text-amber-300 bg-amber-500/15 px-3.5 py-1.5 rounded-xl border border-amber-500/30 text-xs shadow-sm">
                              {count} Items Sold
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#0d1527', color: '#ffffff' }} className="bg-[#0d1527] p-6 rounded-3xl shadow-2xl border border-white/10">
                    <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2 uppercase tracking-wide">
                      <Package className="text-blue-400" /> Sales Visual Chart
                    </h2>
                    <div className="h-72 w-full">
                      {reportData.chartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={reportData.chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 'bold' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 'bold' }} />
                            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#090e1a', borderRadius: '12px', borderColor: 'rgba(255,255,255,0.15)', color: '#ffffff', fontWeight: 'bold' }} />
                            <Bar
                              dataKey="count"
                              radius={[8, 8, 0, 0]}
                              isAnimationActive={true}
                              animationBegin={0}
                              animationDuration={1500}
                              animationEasing="ease-out"
                            >
                              {reportData.chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center text-gray-400 font-bold">No Data for Graph</div>
                      )}
                    </div>
                  </div>

                  <div style={{ backgroundColor: '#0d1527', color: '#ffffff' }} className="bg-[#0d1527] p-6 rounded-3xl shadow-2xl border border-white/10 flex-1 flex flex-col relative overflow-hidden mt-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                      <h2 className="text-xl font-black text-white flex items-center gap-2 uppercase tracking-wide">
                        <TrendingUp className="text-emerald-400" /> Month Wise Report
                      </h2>

                      <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-300">
                        {/* From Month Popover Calendar */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-2 bg-[#131c2e] hover:bg-[#18243b] px-3.5 py-2 rounded-xl border border-white/15 text-xs text-white font-extrabold shadow-sm transition-all cursor-pointer">
                              <Calendar size={14} className="text-amber-400 shrink-0" />
                              <span className="text-slate-400">From:</span>
                              <span className="text-amber-300 font-mono font-black">
                                {reportFromMonth ? format(new Date(reportFromMonth + "-02"), "MMM yyyy") : "Select Month"}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="sabi-calendar-popover p-3 border border-white/20 bg-[#0c1427] text-white shadow-2xl rounded-2xl w-auto" align="end">
                            <CalendarComponent
                              mode="single"
                              selected={reportFromMonth ? new Date(reportFromMonth + "-02") : undefined}
                              onSelect={(date) => {
                                if (date) {
                                  setReportFromMonth(format(date, "yyyy-MM"));
                                }
                              }}
                              className="rounded-xl border-none"
                            />
                          </PopoverContent>
                        </Popover>

                        {/* To Month Popover Calendar */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="flex items-center gap-2 bg-[#131c2e] hover:bg-[#18243b] px-3.5 py-2 rounded-xl border border-white/15 text-xs text-white font-extrabold shadow-sm transition-all cursor-pointer">
                              <Calendar size={14} className="text-amber-400 shrink-0" />
                              <span className="text-slate-400">To:</span>
                              <span className="text-amber-300 font-mono font-black">
                                {reportToMonth ? format(new Date(reportToMonth + "-02"), "MMM yyyy") : "Select Month"}
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="sabi-calendar-popover p-3 border border-white/20 bg-[#0c1427] text-white shadow-2xl rounded-2xl w-auto" align="end">
                            <CalendarComponent
                              mode="single"
                              selected={reportToMonth ? new Date(reportToMonth + "-02") : undefined}
                              onSelect={(date) => {
                                if (date) {
                                  setReportToMonth(format(date, "yyyy-MM"));
                                }
                              }}
                              className="rounded-xl border-none"
                            />
                          </PopoverContent>
                        </Popover>

                        {(reportFromMonth || reportToMonth) && (
                          <button
                            onClick={() => { setReportFromMonth(""); setReportToMonth(""); }}
                            className="text-red-400 hover:text-red-300 font-extrabold text-xs ml-1 cursor-pointer bg-red-950/40 hover:bg-red-900/60 px-3 py-2 rounded-xl border border-red-500/30 transition-colors"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="h-80 w-full">
                      {monthWiseReportData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={monthWiseReportData} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
                            <XAxis dataKey="monthName" tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 'bold' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 'bold' }} />
                            <Tooltip cursor={{ fill: 'rgba(255, 255, 255, 0.08)' }} contentStyle={{ backgroundColor: '#090e1a', borderRadius: '12px', borderColor: 'rgba(255, 255, 255, 0.15)', color: '#ffffff', fontWeight: 'bold' }} />
                            <Legend wrapperStyle={{ paddingTop: '10px', fontWeight: 'bold', color: '#ffffff' }} />
                            <Bar dataKey="totalRevenue" name="Total Revenue" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                            <Bar dataKey="netProfit" name="Net Profit" fill="#10b981" radius={[6, 6, 0, 0]} />
                            <Bar dataKey="totalCost" name="Total Cost" fill="#ef4444" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center text-slate-400 font-extrabold text-sm">No Monthly Data Available for Selected Range</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="h-full flex flex-col">
                  <div style={{ backgroundColor: '#0d1527', color: '#ffffff' }} className="bg-[#0d1527] p-6 rounded-3xl shadow-2xl border border-white/10 flex-1 flex flex-col relative overflow-hidden">

                    <div className="flex items-center gap-4 mb-6 shrink-0 border-b border-white/10 pb-4 relative z-10">
                      <button
                        onClick={() => setIsAdminAuthModalOpen(true)}
                        className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[#131c2e] border border-amber-500/30 text-amber-400 hover:scale-105 cursor-pointer shadow-md shrink-0 transition-transform"
                        title="Click to Login as Admin"
                      >
                        <User size={22} strokeWidth={2.5} />
                      </button>
                      <div>
                        <h2 className="text-xl font-black text-amber-400 leading-tight uppercase tracking-wide">Summary Stats Overview</h2>
                        <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest bg-amber-500/15 px-3 py-0.5 rounded-full border border-amber-500/30 inline-block mt-1">
                          PUBLIC VIEW
                        </span>
                      </div>
                    </div>

                    <div className="flex-1 flex flex-col transition-all duration-500">
                      <ul className="space-y-4 shrink-0">
                        <li className="flex justify-between items-center pb-3 border-b border-white/10">
                          <span className="text-slate-300 font-extrabold text-sm">Total Orders</span>
                          <span className="font-black text-white text-2xl font-mono">{reportData.filteredOrders.length}</span>
                        </li>
                        <li className="flex justify-between items-center pb-3 border-b border-white/10">
                          <span className="text-slate-300 font-extrabold text-sm">Total Items Sold</span>
                          <span className="font-black text-white text-2xl font-mono">{reportData.totalItems}</span>
                        </li>
                        <li className="flex justify-between items-center pb-3 border-b border-white/10">
                          <span className="text-slate-300 font-extrabold text-sm">Total Delivery Charge</span>
                          <span className="font-black text-white text-2xl font-mono">₹{reportData.totalDeliveryCharge.toLocaleString()}</span>
                        </li>
                        <li className="flex justify-between items-center pb-3 border-b border-white/10">
                          <span className="text-slate-300 font-extrabold text-sm">Total Revenue</span>
                          <span className="font-black text-amber-400 text-2xl font-mono drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]">₹{reportData.totalRev.toLocaleString()}</span>
                        </li>
                      </ul>

                      <div className="mt-6 flex-1 min-h-[220px] w-full relative flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={[
                                { name: 'Delivered', value: reportData.filteredOrders.filter(o => o.status === 'Delivered').length },
                                { name: 'In Process', value: reportData.filteredOrders.filter(o => o.status === 'In Process').length }
                              ]}
                              innerRadius="60%"
                              outerRadius="80%"
                              paddingAngle={5}
                              dataKey="value"
                              isAnimationActive={true}
                              animationBegin={200}
                              animationDuration={1500}
                              animationEasing="ease-out"
                            >
                              <Cell fill="#10b981" />
                              <Cell fill="#f59e0b" />
                            </Pie>
                            <Tooltip contentStyle={{ backgroundColor: '#090e1a', borderRadius: '12px', borderColor: 'rgba(255,255,255,0.15)', color: '#ffffff', fontWeight: 'bold' }} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                          <span className="text-3xl font-black text-white">{reportData.filteredOrders.length}</span>
                          <span className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">Total</span>
                        </div>
                      </div>

                      <div className="flex justify-center gap-5 mt-3 shrink-0">
                        <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-300"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> Delivered</div>
                        <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-300"><div className="w-3 h-3 rounded-full bg-amber-500"></div> Processing</div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 🟢 ADMIN DASHBOARD VIEW (Cost Calculation Concept) */}
          {((activeTab as any) === 'admin_panel' || (activeTab as any) === 'inventories_admin_panel') && (
            <div className="max-w-7xl mx-auto h-full animate-in fade-in duration-500 flex flex-col gap-6 w-full">

              {/* 🟢 MODIFIED HEADER: ADDED BOOK DROPDOWN AND SMALLER CLOSE BUTTON */}
              <div style={{ backgroundColor: '#0d1527', color: '#ffffff', borderColor: 'rgba(245, 158, 11, 0.35)' }} className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#0d1527] p-5 rounded-2xl shadow-xl border border-amber-500/35 shrink-0 z-40 relative gap-4">
                <div>
                  <h2 className="text-xl font-black text-amber-400 flex items-center gap-2.5 uppercase tracking-wide">
                    <TrendingUp className="text-amber-400" /> {currentAdminReportDash === 'None' ? 'Detailed Cost Analytics' : `Admin Analytics (${currentAdminReportDash})`}
                  </h2>
                  <p className="text-xs font-bold text-slate-300 mt-1">
                    {isInvAdmin
                      ? 'Sticker (Dynamic) | Labour (₹1) | Live stock balance mapped data.'
                      : 'Sticker (Dynamic) | Labour (₹1) | Order wise mapped data.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {!isInvAdmin && (
                    <div style={{ backgroundColor: '#131c2e' }} className="flex flex-wrap items-center gap-2 bg-[#131c2e] p-2 rounded-xl border border-amber-500/30 text-xs font-bold text-slate-300 shadow-md">
                      <select
                        value={currentAdminDateType}
                        onChange={(e) => handleSetAdminDateType(e.target.value)}
                        style={{ backgroundColor: '#162035', color: '#fbbf24' }}
                        className="font-extrabold text-amber-400 bg-[#162035] outline-none cursor-pointer text-xs px-2.5 py-1.5 rounded-lg border border-white/10"
                      >
                        <option value="Dispatch Date">Dispatch Date</option>
                        <option value="Order Date">Order Date</option>
                        <option value="Function Date">Function Date</option>
                      </select>

                      {/* From Admin Date Popover */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-1.5 bg-[#162035] hover:bg-[#1f2b45] px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white font-extrabold shadow-sm transition-all cursor-pointer">
                            <Calendar size={13} className="text-amber-400 shrink-0" />
                            <span className="text-slate-400">From:</span>
                            <span className="text-amber-300 font-mono font-black">
                              {currentAdminDateRange.from ? format(new Date(currentAdminDateRange.from), "dd MMM yyyy") : "Select Date"}
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="sabi-calendar-popover p-3 border border-white/20 bg-[#0c1427] text-white shadow-2xl rounded-2xl w-auto" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={currentAdminDateRange.from ? new Date(currentAdminDateRange.from) : undefined}
                            onSelect={(date) => {
                              if (date) {
                                handleSetAdminDateRange({ ...currentAdminDateRange, from: format(date, "yyyy-MM-dd") });
                              }
                            }}
                            className="rounded-xl border-none"
                          />
                        </PopoverContent>
                      </Popover>

                      {/* To Admin Date Popover */}
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="flex items-center gap-1.5 bg-[#162035] hover:bg-[#1f2b45] px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white font-extrabold shadow-sm transition-all cursor-pointer">
                            <Calendar size={13} className="text-amber-400 shrink-0" />
                            <span className="text-slate-400">To:</span>
                            <span className="text-amber-300 font-mono font-black">
                              {currentAdminDateRange.to ? format(new Date(currentAdminDateRange.to), "dd MMM yyyy") : "Select Date"}
                            </span>
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="sabi-calendar-popover p-3 border border-white/20 bg-[#0c1427] text-white shadow-2xl rounded-2xl w-auto" align="start">
                          <CalendarComponent
                            mode="single"
                            selected={currentAdminDateRange.to ? new Date(currentAdminDateRange.to) : undefined}
                            onSelect={(date) => {
                              if (date) {
                                handleSetAdminDateRange({ ...currentAdminDateRange, to: format(date, "yyyy-MM-dd") });
                              }
                            }}
                            className="rounded-xl border-none"
                          />
                        </PopoverContent>
                      </Popover>

                      {(currentAdminDateRange.from || currentAdminDateRange.to) && (
                        <button onClick={() => handleSetAdminDateRange({ from: "", to: "" })} className="text-red-400 hover:bg-red-950/60 p-1 rounded-full transition-colors ml-1 cursor-pointer">
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  )}

                  {/* 🟢 NEW BOOK DROPDOWN TO TOGGLE ADMIN REPORTS */}
                  {!isInvAdmin && (
                    <div className="relative">
                      <button
                        onClick={() => handleSetAdminReportMenuOpen(!currentAdminReportMenuOpen)}
                        style={{ backgroundColor: '#131c2e' }}
                        className="px-3.5 py-2 rounded-xl text-xs font-black border border-amber-500/30 text-amber-300 hover:bg-[#18243b] bg-[#131c2e] shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Book size={15} /> {currentAdminReportDash === 'None' ? 'Table View' : currentAdminReportDash} <ChevronDown size={14} />
                      </button>
                      {currentAdminReportMenuOpen && (
                        <div style={{ backgroundColor: '#0d1527' }} className="absolute right-0 mt-2 w-44 bg-[#0d1527] border border-amber-500/30 rounded-xl shadow-2xl z-50 overflow-hidden">
                          <button onClick={() => { handleSetAdminReportDash('None'); handleSetAdminReportMenuOpen(false); }} className="w-full text-left px-4 py-2.5 hover:bg-amber-500/20 text-xs font-extrabold text-amber-300 border-b border-white/10 transition-colors">Table View</button>
                          <button onClick={() => { handleSetAdminReportDash('Dashboard 1'); handleSetAdminReportMenuOpen(false); }} className="w-full text-left px-4 py-2.5 hover:bg-amber-500/20 text-xs font-extrabold text-white border-b border-white/10 transition-colors">Dashboard 1</button>
                          <button onClick={() => { handleSetAdminReportDash('Dashboard 2'); handleSetAdminReportMenuOpen(false); }} className="w-full text-left px-4 py-2.5 hover:bg-amber-500/20 text-xs font-extrabold text-white border-b border-white/10 transition-colors">Dashboard 2</button>
                          <button onClick={() => { handleSetAdminReportDash('All'); handleSetAdminReportMenuOpen(false); }} className="w-full text-left px-4 py-2.5 hover:bg-amber-500/20 text-xs font-extrabold text-amber-400 transition-colors">All Dashboards</button>
                        </div>
                      )}
                    </div>
                  )}

                  {!isInvAdmin && (
                    <button
                      onClick={() => setShowApprovalPanel(true)}
                      style={{ backgroundColor: '#131c2e' }}
                      className="px-3.5 py-2 rounded-xl text-xs font-black border border-amber-500/30 text-amber-400 hover:bg-[#18243b] bg-[#131c2e] shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Lock size={15} /> Approvals ({employees.filter(e => e.status === 'Pending').length})
                    </button>
                  )}

                  <button
                    onClick={() => setActiveTab((activeTab as any) === 'inventories_admin_panel' ? 'inventories' : 'reports')}
                    className="px-3.5 py-2 rounded-xl text-xs font-black border border-red-500/40 text-red-300 hover:bg-red-950/80 hover:text-red-200 bg-red-950/50 shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  >
                    <X size={15} /> Close Admin
                  </button>
                </div>
              </div>

              {/* 🟢 CONDITIONAL RENDER: TABLE VS REPORT VIEW */}
              {currentAdminReportDash === 'None' ? (
                <div style={{ backgroundColor: '#0d1527' }} className="bg-[#0d1527] rounded-3xl shadow-2xl border border-white/10 overflow-hidden flex-1 flex flex-col">
                  <div className="overflow-auto flex-1 px-4 py-0 custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1100px]">
                      <thead style={{ backgroundColor: '#162035' }} className="sticky top-0 bg-[#162035] z-30 shadow-md border-b-2 border-amber-500/30">
                        <tr className="text-xs uppercase tracking-wider text-amber-400">
                          {!isInvAdmin && <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black border-r border-white/10 shadow-sm">Serial No</th>}
                          {!isInvAdmin && <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black border-r border-white/10 shadow-sm">Dispatch Date</th>}
                          <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black shadow-sm">Chocolate Name</th>
                          <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black text-right border-l border-white/10 shadow-sm">Purch. Cost <br /><span className="text-[9px] font-extrabold text-slate-300">(Per Item)</span></th>
                          <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black text-center border-l border-white/10 shadow-sm">Count</th>
                          <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black text-right border-l border-white/10 shadow-sm">Sticker Cost <br /><span className="text-[9px] font-extrabold text-slate-300">(Count × Sticker)</span></th>
                          <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black text-right border-l border-white/10 shadow-sm">Labour Cost <br /><span className="text-[9px] font-extrabold text-slate-300">(Count × 1)</span></th>
                          <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black text-right border-l border-white/10 shadow-sm">Total Purchase <br /><span className="text-[9px] font-extrabold text-slate-300">(Cost × Count)</span></th>
                          <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black text-right border-l border-white/10 shadow-sm">Final Cost <br /><span className="text-[9px] font-extrabold text-slate-300">(Sticker+Lab+Purch)</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {costAnalyticsData.rows.length === 0 ? (
                          <tr><td colSpan={isInvAdmin ? 7 : 9} className="p-8 text-center text-amber-400 font-extrabold">No records found for the selected date range.</td></tr>
                        ) : (
                          costAnalyticsData.rows.map((row, idx) => (
                            <tr key={idx} className={`border-b border-white/5 text-sm transition-colors relative z-0 ${idx % 2 === 0 ? 'bg-[#0f172a]' : 'bg-[#131c2e]'} hover:bg-[#18243b]`}>
                              {!isInvAdmin && <td className="p-3.5 font-extrabold text-slate-300 border-r border-white/5">{row.serialNo}</td>}
                              {!isInvAdmin && <td className="p-3.5 font-extrabold text-amber-300 border-r border-white/5 whitespace-nowrap">{row.deliveryDate}</td>}
                              <td className="p-3.5 font-extrabold text-white border-r border-white/5 max-w-[200px] truncate" title={row.chocolateName}>{row.chocolateName}</td>
                              <td className="p-3.5 text-right font-mono font-bold text-amber-200 border-r border-white/5">₹{row.purchasePricePerItem.toFixed(2)}</td>
                              <td className="p-3.5 text-center font-black text-amber-300 border-r border-white/5">{row.count.toLocaleString()}</td>
                              <td className="p-3.5 text-right font-mono font-extrabold text-slate-100 border-r border-white/5">₹{row.stickerCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td className="p-3.5 text-right font-mono font-extrabold text-slate-100 border-r border-white/5">₹{row.labourCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td className="p-3.5 text-right font-mono font-extrabold text-slate-100 border-r border-white/5">₹{row.totalPurchase.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td className="p-3.5 text-right font-mono font-black text-amber-300">₹{row.finalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                      {costAnalyticsData.rows.length > 0 && (
                        <tfoot style={{ backgroundColor: '#090e1a' }} className="sticky bottom-0 bg-[#090e1a] text-white z-30 shadow-[0_-5px_15px_rgba(0,0,0,0.5)] border-t-2 border-amber-500/40">
                          <tr className="text-sm">
                            {!isInvAdmin && <td className="p-3.5 border-r border-white/10"></td>}
                            {!isInvAdmin && <td className="p-3.5 border-r border-white/10"></td>}
                            <td className="p-3.5 border-r border-white/10"></td>
                            <td className="p-3.5 text-right font-black uppercase tracking-widest text-amber-400 border-r border-white/10">Grand Total:</td>
                            <td className="p-3.5 text-center font-black text-amber-300 border-r border-white/10">{costAnalyticsData.grandTotals.count.toLocaleString()}</td>
                            <td className="p-3.5 text-right font-mono font-extrabold text-slate-100 border-r border-white/10">₹{costAnalyticsData.grandTotals.stickerCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="p-3.5 text-right font-mono font-extrabold text-slate-100 border-r border-white/10">₹{costAnalyticsData.grandTotals.labourCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="p-3.5 text-right font-mono font-extrabold text-slate-100 border-r border-white/10">₹{costAnalyticsData.grandTotals.totalPurchase.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="p-3.5 text-right font-mono font-black text-amber-400 text-lg drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]">₹{costAnalyticsData.grandTotals.finalCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              ) : adminReportData ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch flex-1 overflow-auto custom-scrollbar pr-2 pb-6">
                  <div className="lg:col-span-2 space-y-6">
                    <div style={{ backgroundColor: '#0d1527', color: '#ffffff' }} className="bg-[#0d1527] p-6 rounded-3xl shadow-2xl border border-amber-500/35">
                      <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-black text-amber-400 flex items-center gap-2 uppercase tracking-wide">
                          <TrendingUp className="text-amber-400" /> Top Selling {currentAdminReportDash === 'Dashboard 2' ? 'Products' : 'Chocolates'}
                        </h2>
                      </div>
                      <div className="space-y-3 max-h-[320px] overflow-y-auto pr-2 custom-scrollbar">
                        {adminReportData.topChocs.length === 0 ? (
                          <p className="text-amber-400 font-extrabold text-sm">No sales data in this date range.</p>
                        ) : (
                          adminReportData.topChocs.map(([name, count], index) => (
                            <div key={index} style={{ backgroundColor: '#131c2e' }} className="flex items-center justify-between p-3.5 bg-[#131c2e] hover:bg-[#18243b] rounded-2xl border border-white/10 shadow-md transition-all">
                              <div className="flex items-center gap-3.5">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-black font-black flex items-center justify-center text-xs shadow-md">
                                  #{index + 1}
                                </div>
                                <span className="font-extrabold text-white text-base break-words max-w-[320px]" title={name}>{name}</span>
                              </div>
                              <span className="font-black text-amber-300 bg-amber-500/15 px-3.5 py-1.5 rounded-xl border border-amber-500/30 text-xs shadow-sm">
                                {count} Items Sold
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div style={{ backgroundColor: '#0d1527', color: '#ffffff' }} className="bg-[#0d1527] p-6 rounded-3xl shadow-2xl border border-white/10">
                      <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2 uppercase tracking-wide">
                        <Package className="text-blue-400" /> Sales Visual Chart
                      </h2>
                      <div className="h-72 w-full">
                        {adminReportData.chartData.length > 0 ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={adminReportData.chartData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 'bold' }} />
                              <YAxis tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 'bold' }} />
                              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#090e1a', borderRadius: '12px', borderColor: 'rgba(255,255,255,0.15)', color: '#ffffff', fontWeight: 'bold' }} />
                              <Bar
                                dataKey="count"
                                radius={[8, 8, 0, 0]}
                                isAnimationActive={true}
                                animationBegin={0}
                                animationDuration={1500}
                                animationEasing="ease-out"
                              >
                                {adminReportData.chartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="flex h-full items-center justify-center text-gray-400 font-bold">No Data for Graph</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="h-full flex flex-col">
                    <div style={{ backgroundColor: '#0d1527', color: '#ffffff' }} className="bg-[#0d1527] p-6 rounded-3xl shadow-2xl border border-white/10 flex-1 flex flex-col relative overflow-hidden">

                      <div className="flex items-center gap-4 mb-6 shrink-0 border-b border-white/10 pb-4 relative z-10">
                        <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-[#131c2e] border border-amber-500/30 text-amber-400 shadow-md shrink-0">
                          <User size={22} strokeWidth={2.5} />
                        </div>
                        <div>
                          <h2 className="text-xl font-black text-amber-400 leading-tight uppercase tracking-wide">Summary Stats Overview</h2>
                          <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest bg-amber-500/15 px-3 py-0.5 rounded-full border border-amber-500/30 inline-block mt-1">
                            ADMIN VIEW
                          </span>
                        </div>
                      </div>

                      <div className="flex-1 flex flex-col transition-all duration-500">
                        <ul className="space-y-4 shrink-0">
                          <li className="flex justify-between items-center pb-3 border-b border-white/10">
                            <span className="text-slate-300 font-extrabold text-sm">Total Orders</span>
                            <span className="font-black text-white text-2xl font-mono">{adminReportData.filteredOrders.length}</span>
                          </li>
                          <li className="flex justify-between items-center pb-3 border-b border-white/10">
                            <span className="text-slate-300 font-extrabold text-sm">Total Items Sold</span>
                            <span className="font-black text-white text-2xl font-mono">{adminReportData.totalItems}</span>
                          </li>
                          <li className="flex justify-between items-center pb-3 border-b border-white/10">
                            <span className="text-slate-300 font-extrabold text-sm">Total Delivery Charge</span>
                            <span className="font-black text-white text-2xl font-mono">₹{adminReportData.totalDeliveryCharge.toLocaleString()}</span>
                          </li>
                          <li className="flex justify-between items-center pb-3 border-b border-white/10">
                            <span className="text-slate-300 font-extrabold text-sm">Total Revenue</span>
                            <span className="font-black text-amber-400 text-2xl font-mono drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]">₹{adminReportData.totalRev.toLocaleString()}</span>
                          </li>
                        </ul>

                        <div className="mt-6 flex-1 min-h-[220px] w-full relative flex items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={[
                                  { name: 'Delivered', value: adminReportData.filteredOrders.filter(o => o.status === 'Delivered').length },
                                  { name: 'In Process', value: adminReportData.filteredOrders.filter(o => o.status === 'In Process').length }
                                ]}
                                innerRadius="60%"
                                outerRadius="80%"
                                paddingAngle={5}
                                dataKey="value"
                                isAnimationActive={true}
                                animationBegin={200}
                                animationDuration={1500}
                                animationEasing="ease-out"
                              >
                                <Cell fill="#10b981" />
                                <Cell fill="#f59e0b" />
                              </Pie>
                              <Tooltip contentStyle={{ backgroundColor: '#090e1a', borderRadius: '12px', borderColor: 'rgba(255,255,255,0.15)', color: '#ffffff', fontWeight: 'bold' }} />
                            </PieChart>
                          </ResponsiveContainer>
                          <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                            <span className="text-3xl font-black text-white">{adminReportData.filteredOrders.length}</span>
                            <span className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">Total</span>
                          </div>
                        </div>

                        <div className="flex justify-center gap-5 mt-3 shrink-0">
                          <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-300"><div className="w-3 h-3 rounded-full bg-emerald-500"></div> Delivered</div>
                          <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-300"><div className="w-3 h-3 rounded-full bg-amber-500"></div> Processing</div>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
              ) : null}

            </div>
          )}

        </div>
      </main>

      {/* 🟢 NEW LISTING / NEW PRODUCT MODAL */}
      {isAddProductModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-md" onClick={() => { setIsAddProductModalOpen(false); setEditProductId(null); setNewProductForm({ name: "", wholesalePrice: "", price: "", productType: "Single product" }); setNewProductImages([]); setNewProductExistingImages([]); }}>
          <div className="rounded-[2rem] shadow-2xl w-full max-w-sm p-7 bg-[#0c1427] border border-white/20 text-white max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-black mb-5 text-white text-center tracking-wide border-b border-white/15 pb-3 uppercase">
              {editProductId ? "Edit Listing" : "Add New Listing"}
            </h2>
            <form onSubmit={handleAddCustomProduct} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold mb-1 text-slate-200 uppercase tracking-wider">Item Name</label>
                <input required type="text" value={newProductForm.name} onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })} style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }} className="w-full font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white placeholder-slate-400 shadow-inner text-sm" placeholder="Enter Item Name (e.g. Munch)" />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1 text-slate-200 uppercase tracking-wider">Product Type</label>
                <div className="relative">
                  <select
                    value={newProductForm.productType || "Single product"}
                    onChange={(e) => setNewProductForm({ ...newProductForm, productType: e.target.value })}
                    style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                    className="w-full font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white shadow-inner text-sm cursor-pointer appearance-none pr-8"
                  >
                    <option value="Single product" className="bg-[#162035] text-white">Single product</option>
                    <option value="Combo set" className="bg-[#162035] text-white">Combo set</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                    <ChevronDown size={15} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-200 uppercase tracking-wider">Wholesale Price</label>
                  <input required type="number" step="any" value={newProductForm.wholesalePrice} onChange={(e) => setNewProductForm({ ...newProductForm, wholesalePrice: e.target.value })} style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }} className="w-full font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white placeholder-slate-400 shadow-inner text-sm" placeholder="Wholesale Price" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-200 uppercase tracking-wider">Selling Price</label>
                  <input required type="number" step="any" value={newProductForm.price} onChange={(e) => setNewProductForm({ ...newProductForm, price: e.target.value })} style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }} className="w-full font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white placeholder-slate-400 shadow-inner text-sm" placeholder="Selling Price" />
                </div>
              </div>

              {/* 📷 Product Images (Cloudinary) */}
              <div className="space-y-1.5 pt-1">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Camera size={13} className="text-amber-400" />
                    <span>Photos (Cloudinary)</span>
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                </label>

                {(newProductExistingImages.length > 0 || newProductImages.length > 0) && (
                  <div className="flex flex-wrap gap-2 p-2 bg-[#121b2f] rounded-xl border border-white/10 max-h-28 overflow-y-auto">
                    {newProductExistingImages.map((imgUrl, idx) => (
                      <div key={`modal-existing-${idx}`} className="relative group w-12 h-12 rounded-lg overflow-hidden border border-white/20">
                        <img src={imgUrl} alt="Product" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setNewProductExistingImages(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute top-0.5 right-0.5 bg-rose-600 text-white rounded-full p-0.5 cursor-pointer opacity-80 group-hover:opacity-100"
                        >
                          <X size={9} />
                        </button>
                      </div>
                    ))}
                    {newProductImages.map((file, idx) => (
                      <div key={`modal-new-${idx}`} className="relative group w-12 h-12 rounded-lg overflow-hidden border border-emerald-400/50">
                        <img src={URL.createObjectURL(file)} alt="Upload preview" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setNewProductImages(prev => prev.filter((_, i) => i !== idx))}
                          className="absolute top-0.5 right-0.5 bg-rose-600 text-white rounded-full p-0.5 cursor-pointer opacity-80 group-hover:opacity-100"
                        >
                          <X size={9} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <label className="flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-dashed border-white/20 hover:border-amber-400/60 bg-[#151f36]/60 hover:bg-[#151f36] cursor-pointer transition-all text-xs font-bold text-slate-300 hover:text-white">
                  <Upload size={14} className="text-amber-400" />
                  <span>Choose product photos</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        const selected = Array.from(e.target.files);
                        setNewProductImages(prev => [...prev, ...selected]);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>

              <div className="flex gap-3 pt-3">
                <button type="button" onClick={() => { setIsAddProductModalOpen(false); setEditProductId(null); setNewProductForm({ name: "", wholesalePrice: "", price: "", productType: "Single product" }); setNewProductImages([]); setNewProductExistingImages([]); }} className="flex-1 px-4 py-2.5 rounded-xl font-bold border border-white/20 bg-slate-800/80 text-slate-200 hover:bg-slate-700/80 hover:text-white transition-colors cursor-pointer text-sm">Cancel</button>
                <button type="submit" disabled={isSavingProduct} className={`flex-1 px-4 py-2.5 rounded-xl font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg hover:shadow-xl transition-all cursor-pointer text-sm ${isSavingProduct ? 'opacity-70 cursor-not-allowed' : ''}`}>{isSavingProduct ? "Uploading..." : (editProductId ? "Update Listing" : "Save Listing")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🟢 NEW: INVENTORY MODAL */}
      {isInvModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-md" onClick={() => { setIsInvModalOpen(false); setEditInvId(null); }}>
          <div className="rounded-[2rem] shadow-2xl w-full max-w-md p-8 bg-[#0c1427] border border-white/20 text-white" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-black mb-6 text-white text-center tracking-wide border-b border-white/15 pb-4 uppercase">
              {editInvId ? "Edit Inventory Entry" : "Add Inventory Entry"}
            </h2>
            <form onSubmit={handleAddInventory} className="space-y-4">
              <div>
                <label className="block text-xs font-bold mb-1 text-slate-200 uppercase tracking-wider">Date</label>
                <input required type="date" value={invForm.date} onChange={(e) => setInvForm({ ...invForm, date: e.target.value })} style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }} className="w-full font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white shadow-inner" />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 text-slate-200 uppercase tracking-wider">Chocolate Name</label>
                <select
                  required
                  value={invForm.chocolate}
                  onChange={(e) => setInvForm({ ...invForm, chocolate: e.target.value })}
                  style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                  className="w-full font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white shadow-inner cursor-pointer"
                >
                  <option value="" disabled className="bg-[#0f172a] text-slate-400">Select chocolate...</option>
                  {managedChocolates.map((choc) => (
                    <option key={choc.fireId || choc.id} value={choc.name} className="bg-[#0f172a] text-white">
                      {choc.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-200 uppercase tracking-wider">Boxes</label>
                  <input required type="number" min="1" value={invForm.boxCount} onChange={(e) => setInvForm({ ...invForm, boxCount: e.target.value })} style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }} className="w-full font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white placeholder-slate-400 shadow-inner" placeholder="E.g. 10" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 text-slate-200 uppercase tracking-wider">Count per Box</label>
                  <input required type="number" min="1" value={invForm.itemsPerBox} onChange={(e) => setInvForm({ ...invForm, itemsPerBox: e.target.value })} style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }} className="w-full font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white placeholder-slate-400 shadow-inner" placeholder="E.g. 50" />
                </div>
              </div>

              <div className="bg-slate-900/80 p-3.5 rounded-xl border border-amber-500/30 mt-2 text-center shadow-md">
                <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">Total Items to Add</p>
                <p className="text-2xl font-black text-amber-300">
                  {(Number(invForm.boxCount) || 0) * (Number(invForm.itemsPerBox) || 0)}
                </p>
              </div>

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => { setIsInvModalOpen(false); setEditInvId(null); }} className="flex-1 px-4 py-3 rounded-xl font-bold border border-white/20 bg-slate-800/80 text-slate-200 hover:bg-slate-700/80 hover:text-white transition-colors">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-green-600 hover:bg-green-500 shadow-lg hover:shadow-xl transition-all">Save Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🟢 NEW: MANUAL INVENTORY VIEW DETAILS MODAL */}
      {viewingInvLog && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 backdrop-blur-md" onClick={() => setViewingInvLog(null)}>
          <div className="rounded-[2rem] shadow-2xl w-full max-w-md p-8 bg-[#0c1427] border border-white/20 text-white" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-black mb-6 text-white text-center tracking-wide border-b border-white/15 pb-4 uppercase">
              Manual Inventory Log Details
            </h2>
            <div className="space-y-4 text-sm font-bold text-slate-200">
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span className="text-slate-400">Date:</span>
                <span className="text-white font-extrabold">{formatToDisplayDate(viewingInvLog.date)}</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span className="text-slate-400">Chocolate Name:</span>
                <span className="text-amber-300 font-black">{viewingInvLog.chocolate}</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span className="text-slate-400">Boxes Added:</span>
                <span className="text-white font-extrabold">{viewingInvLog.boxCount} boxes</span>
              </div>
              <div className="flex justify-between border-b border-white/10 pb-2">
                <span className="text-slate-400">Items per Box:</span>
                <span className="text-white font-extrabold">{viewingInvLog.itemsPerBox} items</span>
              </div>
              <div className="flex justify-between bg-slate-900/80 p-4 rounded-xl border border-amber-500/30 text-center flex-col items-center shadow-md">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">Total Chocolates Added</span>
                <span className="text-3xl font-black text-amber-300">+{viewingInvLog.totalChocolates}</span>
              </div>
              <div className="pt-4 flex justify-center">
                <button onClick={() => setViewingInvLog(null)} className="w-full px-4 py-3 rounded-xl font-black text-sm uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-500 shadow-md transition-all">Close Details</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 EXPORT PREVIEW MODAL */}
      {isExportPreviewOpen && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-4 print:p-0 print:bg-white print:block">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden print:w-full print:max-w-none print:h-auto print:max-h-none print:shadow-none print:border-none print:rounded-none print:overflow-visible">

            <div className="p-6 border-b border-amber-100 flex justify-between items-center bg-amber-50/50 print:bg-white print:border-b-2 print:border-black">
              <div>
                <h2 className="text-2xl font-extrabold text-amber-950 print:text-black">Order Records Report</h2>
                <p className="text-amber-700 text-sm font-medium mt-1 print:text-gray-700">
                  Filters Applied: Payment ({paymentFilter}) | Delivery ({deliveryFilter})
                </p>
              </div>
              <div className="print:hidden">
                <button onClick={() => setIsExportPreviewOpen(false)} className="p-2 text-amber-600 hover:bg-amber-100 hover:text-amber-900 rounded-lg transition-colors">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-auto flex-1 print:overflow-visible print:p-4">
              <div className="flex flex-wrap gap-6 mb-6 print:mb-8">
                <div className="bg-white border border-amber-200 p-4 rounded-xl flex-1 min-w-[150px] print:border-gray-400">
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wider print:text-gray-500">Total Records</p>
                  <h4 className="text-2xl font-black text-amber-950 mt-1 print:text-black">{filteredDashboardOrders.length}</h4>
                </div>
                <div className="bg-white border border-amber-200 p-4 rounded-xl flex-1 min-w-[150px] print:border-gray-400">
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wider print:text-gray-500">Total Items</p>
                  <h4 className="text-2xl font-black text-amber-950 mt-1 print:text-black">
                    {filteredDashboardOrders.reduce((sum, o) => sum + Number(o.count || 0), 0)}
                  </h4>
                </div>
                <div className="bg-white border border-amber-200 p-4 rounded-xl flex-1 min-w-[150px] print:border-gray-400">
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wider print:text-gray-500">Filtered Revenue</p>
                  <h4 className="text-2xl font-black text-green-700 mt-1 print:text-black">₹{displayRevenue.toLocaleString()}</h4>
                </div>
              </div>

              <table className="w-full text-left border-collapse border border-amber-200 print:border-black">
                <thead>
                  <tr className="bg-amber-100 text-amber-900 text-sm border-b border-amber-200 print:bg-gray-200 print:text-black print:border-black">
                    <th className="p-3 font-bold border-r border-amber-200 print:border-black">Name</th>
                    <th className="p-3 font-bold border-r border-amber-200 print:border-black">Phone</th>
                    <th className="p-3 font-bold border-r border-amber-200 print:border-black">Dispatch Date</th>
                    <th className="p-3 font-bold border-r border-amber-200 print:border-black">Chocolate</th>
                    <th className="p-3 font-bold border-r border-amber-200 print:border-black text-center">Count</th>

                    <th className="p-3 font-bold border-r border-amber-200 print:border-black text-right">Choc. Price</th>
                    <th className="p-3 font-bold border-r border-amber-200 print:border-black text-right">Del. Charge</th>
                    <th className="p-3 font-bold border-r border-amber-200 print:border-black text-right">Discount</th>

                    <th className="p-3 font-bold border-r border-amber-200 print:border-black text-right">Total Price</th>
                    <th className="p-3 font-bold border-r border-amber-200 print:border-black text-center">Payment</th>
                    <th className="p-3 font-bold text-center border-amber-200 print:border-black">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDashboardOrders.map((order, idx) => {
                    const priceData = calculatePriceInfo(order.chocolate, order.count, order.discount, order.isDeliveryFree, order.paymentStatus, order.category, customPricesMap, order.manualDeliveryFee, order.orderStatus, managedChocPricesMap, order.pricingType, order.manualProductPrice);
                    return (
                      <tr key={idx} className="border-b border-amber-100 text-sm print:border-gray-400">
                        <td className="p-3 font-bold text-amber-950 border-r border-amber-100 print:border-gray-400 print:text-black">{order.name}</td>
                        <td className="p-3 text-amber-800 border-r border-amber-100 print:border-gray-400 print:text-black">{formatPhoneNumber(order.phone)}</td>
                        <td className="p-3 font-medium text-amber-900 border-r border-amber-100 print:border-gray-400 print:text-black">{order.deliveryDate || order.functionDate || order.orderDate || "-"}</td>
                        <td className="p-3 text-amber-800 border-r border-amber-100 print:border-gray-400 print:text-black max-w-[200px] truncate">{order.chocolate}</td>

                        <td className="p-3 text-center font-bold text-amber-950 border-r border-amber-100 print:border-gray-400 print:text-black">
                          {order.count}
                        </td>

                        <td className="p-3 text-right font-medium text-amber-900 border-r border-amber-100 print:border-gray-400 print:text-black">₹{priceData.chocolatePrice.toLocaleString()}</td>
                        <td className="p-3 text-right font-medium text-amber-900 border-r border-amber-100 print:border-gray-400 print:text-black">
                          {order.isDeliveryFree ? 'Free' : `₹${priceData.deliveryCharge.toLocaleString()}`}
                        </td>
                        <td className="p-3 text-right font-medium text-red-600 border-r border-amber-100 print:border-gray-400 print:text-black">-₹{order.discount || 0}</td>

                        <td className="p-3 text-right font-bold text-amber-950 border-r border-amber-100 print:border-gray-400 print:text-black">₹{priceData.totalPrice.toLocaleString()}</td>
                        <td className="p-3 text-center font-bold text-amber-800 border-r border-amber-100 print:border-gray-400 print:text-black">{order.paymentStatus || 'Pending'}</td>
                        <td className="p-3 text-center font-bold text-amber-800 border-amber-100 print:border-gray-400 print:text-black">{order.status}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-6 border-t border-amber-200 bg-white flex justify-end gap-4 print:hidden shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] z-10">
              <button onClick={() => setIsExportPreviewOpen(false)} className="px-6 py-2.5 rounded-xl font-bold border-2 border-amber-200 text-amber-800 hover:bg-amber-50 hover:border-amber-300 transition-colors">
                Cancel
              </button>
              <button onClick={handleExportExcel} className="px-8 py-2.5 rounded-xl font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-md hover:shadow-lg transition-all flex items-center gap-2">
                <Download size={20} /> Download as Excel
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 🟢 MODALS (ADD/EDIT) */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3 sm:p-4 print:hidden backdrop-blur-sm"
          onClick={() => !isSavingOrder && setIsModalOpen(false)}
        >
          <div
            style={{ backgroundColor: '#0b1329', borderColor: 'rgba(255, 255, 255, 0.15)', color: '#ffffff' }}
            className="rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.85)] w-full max-w-[800px] p-4 sm:p-6 overflow-y-auto max-h-[90dvh] border custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative border-b border-white/10 pb-3 mb-4 flex items-center justify-between">
              {/* Invisible spacer to center the title */}
              <div className="w-[100px] hidden sm:block"></div>

              <h2 className="text-xl font-black text-white text-center tracking-wide flex-1 sm:text-center text-left uppercase">
                {formData.id ? "Edit Order Details" : "Add New Order"}
              </h2>

              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-[10px] font-black uppercase tracking-wider ${orderTypeOthersToggle ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {orderTypeOthersToggle ? 'Others' : 'Self'}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const nextVal = !orderTypeOthersToggle;
                    setOrderTypeOthersToggle(nextVal);
                    setFormData(prev => ({ ...prev, role: nextVal ? 'Others' : 'Self' }));
                  }}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${orderTypeOthersToggle ? 'bg-emerald-500' : 'bg-rose-500'}`}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${orderTypeOthersToggle ? 'translate-x-4' : 'translate-x-0'}`}
                  />
                </button>
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                {/* Column 1: Customer & Dates */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-200">Customer Name</label>
                    <input
                      required
                      autoComplete="off"
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                      className="w-full text-sm font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white placeholder-slate-400 shadow-inner transition-colors"
                      placeholder="Enter Name"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-200">Contact Number</label>
                    <input
                      required
                      autoComplete="off"
                      type="text"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                      className="w-full text-sm font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white placeholder-slate-400 shadow-inner transition-colors"
                      placeholder="Phone Number"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-200">Function Date</label>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-200">Dispatch Date</label>
                    <div>
                      <input
                        required
                        type="date"
                        name="functionDate"
                        value={formData.functionDate}
                        onChange={handleInputChange}
                        style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                        className="w-full text-xs font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white shadow-inner transition-colors"
                      />
                    </div>
                    <div>
                      <input
                        required
                        type="date"
                        name="deliveryDate"
                        value={formData.deliveryDate}
                        onChange={handleInputChange}
                        style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                        className="w-full text-xs font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white shadow-inner transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-200">Address (Optional)</label>
                    <textarea
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                      className="w-full text-xs font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white placeholder-slate-400 shadow-inner resize-none transition-colors"
                      placeholder="Enter delivery address..."
                      rows={2}
                    />
                  </div>
                </div>

                {/* Column 2: Order Details */}
                <div className="space-y-3">
                  {formData.category === 'product' && (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-200">Products</label>
                        <button
                          type="button"
                          onClick={() => {
                            setProductRows(prev => [...prev, { productName: "", quantity: "", price: "" }]);
                          }}
                          style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: '#ffffff' }}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 transition-all hover:brightness-110 shadow-sm cursor-pointer"
                        >
                          <Plus size={10} /> Add Product
                        </button>
                      </div>
                      {productRows.map((row, idx) => (
                        <div key={idx} style={{ backgroundColor: '#141d33', borderColor: 'rgba(255, 255, 255, 0.15)' }} className="p-2.5 rounded-xl border space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider">Product {idx + 1}</span>
                            {productRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const newRows = productRows.filter((_, i) => i !== idx);
                                  setProductRows(newRows);
                                  // Sync formData
                                  const names = newRows.map(r => r.productName.trim()).filter(Boolean).join(', ');
                                  const qtys = newRows.map(r => r.quantity.trim()).filter(Boolean).join(', ');
                                  const totalPrice = newRows.reduce((s, r) => s + (Number(r.price) || 0) * (Number(r.quantity) || 0), 0);
                                  const totalQty = newRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                                  setFormData(prev => ({ ...prev, chocolate: names, count: String(totalQty), manualProductPrice: totalQty > 0 ? String(Math.round(totalPrice / totalQty)) : '' }));
                                }}
                                className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 p-1 rounded-lg transition-colors shrink-0 cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <ChocolateSingleSelect
                              value={row.productName}
                              onChange={(val) => {
                                const newRows = [...productRows];
                                newRows[idx].productName = val;
                                // Auto-populate selling price
                                const matched = customProducts.find(p => p.name?.trim().toLowerCase() === val.trim().toLowerCase());
                                if (matched) {
                                  newRows[idx].price = String(matched.price ?? matched.sellingPrice ?? '');
                                }
                                setProductRows(newRows);
                                // Sync formData for backward compat
                                const names = newRows.map(r => r.productName.trim()).filter(Boolean).join(', ');
                                const totalQty = newRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                                const totalPrice = newRows.reduce((s, r) => s + (Number(r.price) || 0) * (Number(r.quantity) || 0), 0);
                                setFormData(prev => ({ ...prev, chocolate: names, count: String(totalQty), manualProductPrice: totalQty > 0 ? String(Math.round(totalPrice / totalQty)) : matched ? String(matched.price ?? matched.sellingPrice ?? '') : prev.manualProductPrice }));
                              }}
                              suggestions={Array.from(new Set(orderedProducts.map(p => p.name).filter(Boolean)))}
                              pricesMap={customPricesMap}
                              placeholderText="Select product..."
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 mb-0.5 uppercase">Quantity</label>
                              <input
                                type="number"
                                value={row.quantity}
                                onChange={(e) => {
                                  const newRows = [...productRows];
                                  newRows[idx].quantity = e.target.value;
                                  setProductRows(newRows);
                                  const totalQty = newRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                                  const totalPrice = newRows.reduce((s, r) => s + (Number(r.price) || 0) * (Number(r.quantity) || 0), 0);
                                  setFormData(prev => ({ ...prev, count: String(totalQty), manualProductPrice: totalQty > 0 ? String(Math.round(totalPrice / totalQty)) : prev.manualProductPrice }));
                                }}
                                style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                                className="w-full text-xs font-bold rounded-lg p-2 outline-none border focus:border-amber-400 text-white shadow-inner"
                                placeholder="Qty"
                              />
                            </div>
                            <div>
                              <label className="block text-[9px] font-bold text-slate-400 mb-0.5 uppercase">Price (₹)</label>
                              <input
                                type="number"
                                value={row.price}
                                onChange={(e) => {
                                  const newRows = [...productRows];
                                  newRows[idx].price = e.target.value;
                                  setProductRows(newRows);
                                  const totalQty = newRows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
                                  const totalPrice = newRows.reduce((s, r) => s + (Number(r.price) || 0) * (Number(r.quantity) || 0), 0);
                                  setFormData(prev => ({ ...prev, manualProductPrice: totalQty > 0 ? String(Math.round(totalPrice / totalQty)) : prev.manualProductPrice }));
                                }}
                                style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                                className="w-full text-xs font-bold rounded-lg p-2 outline-none border focus:border-amber-400 text-white shadow-inner"
                                placeholder="Selling Price"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {formData.category === 'product' ? (
                    <></>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-200">Chocolates List</label>
                        <button
                          type="button"
                          onClick={() => {
                            const newRows = [...chocolateRows, { chocolate: "", count: "" }];
                            setChocolateRows(newRows);
                          }}
                          style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#000000' }}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-black flex items-center gap-1 transition-all hover:brightness-110 shadow-sm cursor-pointer"
                        >
                          <Plus size={10} /> Add Chocolate
                        </button>
                      </div>
                      {chocolateRows.map((row, idx) => (
                        <div key={idx} style={{ backgroundColor: '#141d33', borderColor: 'rgba(255, 255, 255, 0.15)' }} className="flex gap-2 items-center p-2.5 rounded-xl border">
                          <div className="flex-1 min-w-0">
                            <ChocolateSingleSelect
                              value={row.chocolate}
                              onChange={(val) => {
                                const newRows = [...chocolateRows];
                                newRows[idx].chocolate = val;
                                setChocolateRows(newRows);
                                const chocsStr = newRows.map(r => r.chocolate.trim()).filter(Boolean).join(', ');
                                const countsStr = newRows.map(r => r.count.trim()).filter(Boolean).join(', ');
                                setFormData(prev => ({
                                  ...prev,
                                  chocolate: chocsStr,
                                  count: countsStr
                                }));
                              }}
                              suggestions={uniqueChocolates}
                              pricesMap={managedChocPricesMap}
                              placeholderText="Select chocolate..."
                            />
                          </div>
                          <div className="w-20 shrink-0">
                            <input
                              required
                              type="text"
                              value={row.count}
                              onChange={(e) => {
                                const newRows = [...chocolateRows];
                                newRows[idx].count = e.target.value;
                                setChocolateRows(newRows);
                                const chocsStr = newRows.map(r => r.chocolate.trim()).filter(Boolean).join(', ');
                                const countsStr = newRows.map(r => r.count.trim()).filter(Boolean).join(', ');
                                setFormData(prev => ({
                                  ...prev,
                                  chocolate: chocsStr,
                                  count: countsStr
                                }));
                              }}
                              style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                              className="w-full text-xs font-bold rounded-lg p-2 outline-none border focus:border-amber-400 text-white shadow-inner"
                              placeholder="Qty"
                            />
                          </div>
                          {chocolateRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newRows = chocolateRows.filter((_, i) => i !== idx);
                                setChocolateRows(newRows);
                                const chocsStr = newRows.map(r => r.chocolate.trim()).filter(Boolean).join(', ');
                                const countsStr = newRows.map(r => r.count.trim()).filter(Boolean).join(', ');
                                setFormData(prev => ({
                                  ...prev,
                                  chocolate: chocsStr,
                                  count: countsStr
                                }));
                              }}
                              className="text-rose-400 hover:text-rose-300 hover:bg-rose-500/20 p-1.5 rounded-lg transition-colors shrink-0 cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-200">Discount Amount</label>
                    <input
                      type="number"
                      list="discount-suggestions"
                      name="discount"
                      value={formData.discount || ''}
                      onChange={handleInputChange}
                      style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                      className="w-full text-sm font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white placeholder-slate-400 shadow-inner"
                      placeholder="Eg. 50"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-200">
                      Delivery Charge (₹)
                    </label>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-slate-200">
                      Location
                    </label>
                    <div>
                      <input
                        type="number"
                        name="manualDeliveryFee"
                        value={formData.manualDeliveryFee}
                        onChange={handleInputChange}
                        style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                        className="w-full font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white shadow-inner text-sm"
                        placeholder={formData.category === 'product' ? 'Eg. 100' : `${Number(formData.count) > 99 ? '200' : '150'}`}
                      />
                    </div>

                    <div>
                      <select
                        value={(formData as any).location || (formData.isChennai ? "Chennai" : "Others")}
                        onChange={(e) => {
                          const val = e.target.value;
                          const isC = val === "Chennai";
                          const isK = val === "Kerala";
                          const newFormData = { ...formData, isChennai: isC, location: val } as any;
                          const priceData = calculatePriceInfo(
                            newFormData.chocolate,
                            newFormData.count,
                            newFormData.discount,
                            newFormData.isDeliveryFree || isC || isK,
                            newFormData.paymentStatus,
                            newFormData.category,
                            customPricesMap,
                            newFormData.manualDeliveryFee,
                            newFormData.orderStatus,
                            managedChocPricesMap,
                            newFormData.pricingType,
                            newFormData.manualProductPrice
                          );
                          const currentAdvance = Number(newFormData.advanceAmount);
                          if (formData.fireId === null) {
                            if (currentAdvance >= priceData.fullTotalPrice && priceData.fullTotalPrice > 0) {
                              newFormData.paymentStatus = 'Full Paid';
                            } else if (currentAdvance > 0) {
                              newFormData.paymentStatus = 'Partially Paid';
                            } else {
                              newFormData.paymentStatus = 'Pending';
                            }
                          }
                          setFormData(newFormData);
                        }}
                        style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                        className="w-full h-[42px] font-bold rounded-xl px-3 text-white text-xs uppercase tracking-wider outline-none focus:border-amber-400 cursor-pointer shadow-inner"
                      >
                        <option value="Chennai" className="bg-[#0f172a] text-white">Chennai</option>
                        <option value="Kerala" className="bg-[#0f172a] text-white">Kerala</option>
                        <option value="Others" className="bg-[#0f172a] text-white">Others</option>
                      </select>
                    </div>
                  </div>

                  {/* Order Type - shown for all categories as dropdown */}
                    <div>
                      <label className="block text-[11px] font-black uppercase tracking-wider mb-1.5 text-slate-200">Order Type</label>
                      <select
                        name="orderType"
                        value={formData.orderType}
                        onChange={handleInputChange}
                        style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                        className="w-full font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white shadow-inner text-xs cursor-pointer"
                      >
                        {formData.orderType && !orderTypes.some((ot, idx) => getOrderTypeName(ot) === formData.orderType) && (
                          <option value={formData.orderType} className="bg-[#0f172a] text-white">
                            {formData.orderType}
                          </option>
                        )}
                        {orderTypes.map((ot, idx) => {
                          const name = getOrderTypeName(ot);
                          const id = getOrderTypeId(ot, idx);
                          return (
                            <option key={id} value={name} className="bg-[#0f172a] text-white">
                              {name}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                </div>

                {/* Column 3: Payment & Summary */}
                <div className="space-y-3">
                  {formData.category !== 'product' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider mb-1 text-slate-200">Payment Status</label>
                        <select
                          required
                          name="paymentStatus"
                          value={formData.paymentStatus}
                          onChange={handleInputChange}
                          style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                          className="w-full font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white shadow-inner text-xs cursor-pointer"
                        >
                          <option value="Pending" className="bg-[#0f172a] text-white">Pending</option>
                          <option value="Partially Paid" className="bg-[#0f172a] text-white">Part. Paid</option>
                          <option value="Full Paid" className="bg-[#0f172a] text-white">Full Paid</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider mb-1 text-slate-200">Delivery Status</label>
                        <select
                          required
                          name="status"
                          value={formData.status}
                          onChange={handleInputChange}
                          style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                          className="w-full font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white shadow-inner text-xs cursor-pointer"
                        >
                          <option value="In Process" className="bg-[#0f172a] text-white">In Process</option>
                          <option value="Delivered" className="bg-[#0f172a] text-white">Delivered</option>
                        </select>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {formData.category !== 'product' ? (
                      <div className="col-span-2">
                        <label className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-200">Advance Paid (₹)</label>
                        <input
                          type="number"
                          name="advanceAmount"
                          value={formData.advanceAmount || ''}
                          onChange={handleInputChange}
                          style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                          className="w-full text-sm font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white placeholder-slate-400 shadow-inner"
                          placeholder="Advance amount"
                        />
                      </div>
                    ) : (
                      <div className="col-span-2">
                        <label className="block text-[11px] font-black uppercase tracking-wider mb-1 text-slate-200">Advance Amount Paid (₹)</label>
                        <input
                          type="number"
                          name="advanceAmount"
                          value={formData.advanceAmount || ''}
                          onChange={handleInputChange}
                          style={{ backgroundColor: '#162035', color: '#ffffff', borderColor: 'rgba(255, 255, 255, 0.2)' }}
                          className="w-full text-sm font-bold rounded-xl p-2.5 outline-none border focus:border-amber-400 text-white placeholder-slate-400 shadow-inner"
                          placeholder="Enter advance amount paid"
                        />
                      </div>
                    )}
                  </div>

                  <div style={{ backgroundColor: '#141e36', borderColor: 'rgba(245, 158, 11, 0.35)', color: '#ffffff' }} className="border-2 rounded-2xl p-3 flex flex-col gap-1.5 shadow-md text-xs">
                    <div className="flex justify-between items-center font-bold text-slate-200">
                      <span>{formData.category === 'product' ? 'Products Price:' : 'Chocolates Price:'}</span>
                      <span className="text-amber-300 font-black">₹{(liveFormPrice.fullChocolatePrice || 0).toLocaleString()}</span>
                    </div>

                    <div className="flex justify-between items-center font-bold text-slate-200 border-b border-white/10 pb-1.5">
                      <span>Delivery Charge:</span>
                      <span>{(formData.isDeliveryFree || formData.isChennai) ? <span className="text-emerald-400 font-black">Free</span> : <span className="text-amber-300 font-black">₹{(liveFormPrice.fullDeliveryCharge || 0).toLocaleString()}</span>}</span>
                    </div>
                    <label className="flex items-center gap-1.5 cursor-pointer font-bold text-slate-200 pt-0.5">
                      <input
                        type="checkbox"
                        checked={formData.isDeliveryFree || false}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          const newFormData = { ...formData, isDeliveryFree: checked };
                          const priceData = calculatePriceInfo(
                            newFormData.chocolate,
                            newFormData.count,
                            newFormData.discount,
                            checked || newFormData.isChennai,
                            newFormData.paymentStatus,
                            newFormData.category,
                            customPricesMap,
                            newFormData.manualDeliveryFee,
                            newFormData.orderStatus,
                            managedChocPricesMap,
                            newFormData.pricingType,
                            newFormData.manualProductPrice
                          );
                          const currentAdvance = Number(newFormData.advanceAmount);
                          if (formData.fireId === null) {
                            if (currentAdvance >= priceData.fullTotalPrice && priceData.fullTotalPrice > 0) {
                              newFormData.paymentStatus = 'Full Paid';
                            } else if (currentAdvance > 0) {
                              newFormData.paymentStatus = 'Partially Paid';
                            } else {
                              newFormData.paymentStatus = 'Pending';
                            }
                          }
                          setFormData(newFormData);
                        }}
                        className="accent-amber-400 w-4 h-4 cursor-pointer"
                      />
                      Delivery Free
                    </label>

                    {(Number(formData.discount) || 0) > 0 && (
                      <div className="flex justify-between items-center font-bold text-rose-400 border-b border-white/10 pb-1.5 mt-0.5">
                        <span>Discount Applied:</span>
                        <span>-₹{(Number(formData.discount) || 0).toLocaleString()}</span>
                      </div>
                    )}

                    <div className="flex justify-between items-center pt-1.5 mt-0.5 border-t border-white/10">
                      <span className="font-black text-white text-xs uppercase tracking-wider">Total Order Price:</span>
                      <span className="text-lg font-black text-emerald-400">₹{(liveFormPrice.fullTotalPrice || 0).toLocaleString()}</span>
                    </div>
                    {Number(formData.advanceAmount) > 0 && (
                      <div className="flex justify-between items-center font-black text-sky-300 border-t border-white/10 pt-1 mt-0.5">
                        <span>Advance Paid:</span>
                        <span>₹{Number(formData.advanceAmount).toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2.5 pt-2">
                    <button
                      type="button"
                      disabled={isSavingOrder}
                      onClick={() => setIsModalOpen(false)}
                      style={{ backgroundColor: '#1e293b', color: '#ffffff', border: '1px solid rgba(255, 255, 255, 0.2)', fontWeight: 800 }}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer hover:bg-slate-700 transition-colors ${isSavingOrder ? 'opacity-50 cursor-not-allowed' : ''}`}
                      fire-id="cancel-btn"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingOrder}
                      style={{ background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 50%, #d97706 100%)', color: '#000000', fontWeight: 900 }}
                      className={`flex-1 px-3 py-2.5 rounded-xl text-xs uppercase tracking-wider shadow-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 ${isSavingOrder ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                      {isSavingOrder ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        formData.id ? "Update Order" : "Save Order"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 🟢 PREVIEW MODAL WITH SCREENSHOT CAPTURE ICON */}
      {isPreviewOpen && previewData && (() => {
        const previewPrice = calculatePriceInfo(previewData.chocolate, previewData.count, previewData.discount, previewData.isDeliveryFree, previewData.paymentStatus, previewData.category, customPricesMap, previewData.manualDeliveryFee, previewData.orderStatus, managedChocPricesMap, previewData.pricingType, previewData.manualProductPrice);
        return (
          <div
            className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4 print:hidden backdrop-blur-sm"
            onClick={() => setIsPreviewOpen(false)}
          >
            <div
              className="rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.5)] w-full max-w-[600px] p-4 sm:p-6 text-center bg-[#fffcf9] max-h-[90dvh] overflow-y-auto overflow-x-auto relative border border-amber-100 custom-scrollbar"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={handleCapturePreview}
                className="absolute top-4 right-4 p-2.5 bg-amber-100 text-amber-800 hover:bg-amber-200 rounded-full transition-transform hover:scale-110 z-20 shadow-sm cursor-pointer"
                title="Copy Receipt Screenshot to Clipboard"
              >
                <Camera size={18} />
              </button>

              {/* CAPTURE AREA */}
              <div id="preview-modal-content" className="bg-[#fffcf9] p-4 sm:p-5 rounded-xl mx-auto" style={{ minWidth: '300px', maxWidth: '550px', width: '100%', minHeight: '450px' }}>


                <div className="flex justify-between items-center mb-4 border-b-2 border-dashed border-[#d7ccc8] pb-4 pt-1">
                  <div className="text-left flex flex-col justify-center">
                    <div className="w-14 h-14 rounded-xl mb-2 flex items-center justify-center border-[3px] bg-amber-50 border-amber-200 text-amber-600 overflow-hidden shadow-inner relative">
                      <img src={profilePicUrl} alt="Profile" className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
                      <User size={24} className="absolute -z-10" />
                    </div>
                    <h2 className="text-xl font-black text-[#3e2723]">{previewData.name}</h2>
                    <p className="font-bold text-amber-700 text-[12px] mb-1">{formatPhoneNumber(previewData.phone)}</p>
                    <span className="inline-block bg-amber-200 text-amber-950 px-2 py-0.5 rounded text-[10px] font-black tracking-widest border border-amber-300 w-max shadow-sm mb-0.5">
                      INV: {getSerial(previewData.id)}
                    </span>
                    <span className="text-[10px] font-bold text-amber-800/70 flex items-center gap-1">
                      <Calendar size={10} /> Order Date: {previewData.orderDate}
                    </span>
                  </div>

                  <div className="shrink-0 flex flex-col items-center bg-white p-2 rounded-xl border-2 border-dashed border-amber-200 shadow-sm">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&data=upi://pay?pa=8220638753@upi%26pn=SUBASH%20G%26am=${previewPrice.totalPrice}%26cu=INR&color=78350f&bgcolor=fffcf9`}
                      alt="Payment QR Code"
                      className="w-16 h-16 rounded-lg"
                      crossOrigin="anonymous"
                    />
                    <span className="text-[9px] font-bold text-amber-600 mt-1 uppercase tracking-wider">Scan to Pay</span>
                    <span className="text-[9px] font-bold text-amber-800 tracking-wide mt-0.5">SUBASH G</span>
                  </div>
                </div>

                <div className="rounded-2xl p-5 text-left mb-3 bg-white border border-[#d7ccc8] shadow-[inset_0_2px_10px_rgba(0,0,0,0.02)] overflow-hidden">
                  <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>


                    <tbody>
                      {/* Row 1: Chocolate & Quantity Labels */}
                      <tr>
                        <td style={{ width: '140px' }} className="align-bottom pb-1">
                          <p className="font-bold text-[#8d6e63] uppercase text-[10px] tracking-wider">{previewData.category === 'product' ? 'Product' : 'Chocolate'}</p>
                        </td>
                        <td style={{ width: '105px' }} className="border-r border-[#f0e6db] pb-1"></td>
                        <td style={{ width: '140px' }} className="pl-4 align-bottom pb-1">
                          <p className="font-bold text-[#8d6e63] uppercase text-[10px] tracking-wider">Quantity</p>
                        </td>
                        <td style={{ width: '105px' }} className="pb-1 pr-4"></td>


                      </tr>
                      {/* Row 2: Chocolate & Quantity Values */}
                      <tr>
                        <td colSpan={2} className="border-r border-[#f0e6db] align-top border-b border-[#f5f5f5] pb-3">
                          <div className="w-full min-h-[24px]">{renderChocolateBadges(previewData.chocolate)}</div>
                        </td>
                        <td colSpan={2} className="pl-4 align-top border-b border-[#f5f5f5] pb-3 text-right pr-4">
                          <p className="font-black text-[#3e2723] text-lg leading-none">{previewData.count} Items</p>

                          {previewPrice.unitPrice > 0 && Number(previewData.count) > 0 && (
                            <span className="inline-block text-[10px] text-[#8d6e63] font-black tracking-widest bg-[#f5f5f5] px-2 py-0.5 rounded-full border border-[#d7ccc8] mt-1">
                              ₹{previewPrice.unitPrice} x {previewData.count}
                            </span>
                          )}
                        </td>
                      </tr>
                      {/* Row 3: Subtotal & Delivery */}
                      <tr>
                        <td className="pt-3 pb-3">
                          <span className="text-[#8d6e63] font-bold text-[12px]">Subtotal</span>
                        </td>
                        <td className="border-r border-[#f0e6db] pt-3 pb-3 text-right">
                          <span className="text-[#3e2723] font-bold text-[12px]">₹{(previewPrice.fullChocolatePrice || 0).toLocaleString()}</span>
                        </td>
                        <td className="pl-4 pt-3 pb-3">
                          <span className="text-[#8d6e63] font-bold text-[12px]">Delivery</span>
                        </td>
                        <td className="pt-3 pb-3 text-right pr-4">
                          <span className="text-[#3e2723] font-bold text-[12px]">{previewData.isDeliveryFree ? <span className="text-green-600 font-black">Free</span> : `₹${previewPrice.fullDeliveryCharge || 0}`}</span>
                        </td>

                      </tr>
                      {/* Row 4: Dates & Status Labels */}
                      <tr>
                        <td className="pt-2 border-t border-[#f5f5f5]">
                          <p className="text-[#8d6e63] text-[10px] uppercase font-bold">Function</p>
                        </td>
                        <td className="border-r border-[#f0e6db] pt-2 border-t border-[#f5f5f5]"></td>
                        <td className="pl-4 pt-2 border-t border-[#f5f5f5]">
                          <p className="text-amber-800 text-[10px] uppercase font-bold text-right">Payment</p>
                        </td>
                        <td className="pt-2 border-t border-[#f5f5f5]"></td>
                      </tr>
                      {/* Row 5: Dates & Status Values */}
                      <tr>
                        <td colSpan={2} className="border-r border-[#f0e6db] pb-2">
                          <p className="text-[#3e2723] font-bold flex items-center gap-1 text-[11px]"><Calendar size={12} /> {previewData.functionDate}</p>
                        </td>
                        <td colSpan={2} className="pl-4 pb-2 text-right pr-4">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black border mt-1 ${previewData.paymentStatus === 'Full Paid' ? 'bg-[#e6f7ec] text-[#047857] border-[#9fe2bf] payment-badge-full-paid' : previewData.paymentStatus === 'Partially Paid' ? 'bg-[#fff7ed] text-[#d35400] border-[#fdba74] payment-badge-partially-paid' : 'bg-[#fee2e2] text-[#b91c1c] border-[#fca5a5] payment-badge-pending'}`}>{previewData.paymentStatus || 'Pending'}</span>
                        </td>

                      </tr>
                      {/* Row 6: Dispatch Date & Status Label */}
                      <tr>
                        <td className="">
                          <p className="text-[#8d6e63] text-[10px] uppercase font-bold">Delivery</p>
                        </td>
                        <td className="border-r border-[#f0e6db]"></td>
                        <td className="pl-4">
                          <p className="text-amber-800 text-[10px] uppercase font-bold text-right">Status</p>
                        </td>
                        <td className=""></td>
                      </tr>
                      {/* Row 7: Dispatch Date & Status Value */}
                      <tr>
                        <td colSpan={2} className="border-r border-[#f0e6db] pb-2">
                          <p className="text-[#3e2723] font-bold flex items-center gap-1 text-[11px]"><Calendar size={12} /> {previewData.deliveryDate || previewData.functionDate || previewData.orderDate || "-"}</p>
                        </td>
                        <td colSpan={2} className="pl-4 pb-2 text-right pr-4">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-black border mt-1 ${previewData.status === 'Delivered' ? 'bg-green-100 text-green-700 border-green-300 status-badge-delivered' : 'bg-amber-100 text-amber-700 border-amber-300 status-badge-in-process'}`}>{previewData.status}</span>
                        </td>

                      </tr>
                    </tbody>
                  </table>

                  {previewData.discount > 0 && (
                    <table className="w-full border-t border-[#f5f5f5] pt-3 mt-3">
                      <tbody>
                        <tr>
                          <td className="text-left text-red-600 font-black text-xs">Applied Discount</td>
                          <td className="text-right text-red-600 font-black text-xs">-₹{previewData.discount}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}

                  <table className="w-full border-b-2 border-t-2 border-dashed border-[#d7ccc8] mt-3 py-2">
                    <tbody>
                      <tr>
                        <td className="text-left">
                          <p className="font-black text-[#5d4037] uppercase text-[10px] tracking-widest">Grand Total</p>
                          <p className="text-[9px] font-bold text-gray-400 leading-none">Net Payable Amount</p>
                        </td>
                        <td className="text-right font-black text-3xl text-green-700 pr-4">₹{(previewPrice.fullTotalPrice || 0).toLocaleString()}</td>

                      </tr>
                    </tbody>
                  </table>

                  {previewData.address && (
                    <div className="pt-2">
                      <span className="font-bold text-[#8d6e63] text-[9px] uppercase tracking-widest mb-1 block">Delivery Address</span>
                      <span className="font-bold text-[10px] text-[#3e2723] bg-[#f5f5f5] p-2 rounded-lg border border-[#d7ccc8] block truncate">{previewData.address}</span>
                    </div>
                  )}
                </div>


                <div className="mb-2 p-2 bg-red-50 border border-red-100 rounded-xl text-center">
                  <span className="text-[9px] font-black text-red-600 uppercase leading-none block">Note: Order will be confirmed once the amount paid.</span>
                </div>
                <p className="text-[10px] font-black text-amber-600 uppercase tracking-tighter italic opacity-80 text-center">Thank you for your order! ❤️</p>
              </div>

              <button
                onClick={() => setIsPreviewOpen(false)}
                className="w-full py-3 mt-3 rounded-xl font-black text-white bg-gradient-to-r from-[#8d6e63] to-[#5d4037] shadow-lg transition-transform hover:-translate-y-1 active:scale-95 uppercase tracking-widest text-xs"
              >
                Close Preview
              </button>
            </div>
          </div>
        );
      })()}

      {/* 🟢 NEW: SHIPPING LABEL MODAL */}
      {isShippingOpen && shippingOrder && (
        <div className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center p-3 sm:p-4 print:hidden backdrop-blur-sm" onClick={() => setIsShippingOpen(false)}>
          <div className="rounded-3xl shadow-2xl w-full max-w-2xl bg-gray-100 flex flex-col max-h-[90dvh]" onClick={(e) => e.stopPropagation()}>

            <div className="p-4 flex justify-between bg-white border-b border-gray-200 rounded-t-3xl items-center">
              <h2 className="text-lg sm:text-xl font-extrabold text-black">Shipping Label Preview</h2>
              <button onClick={() => setIsShippingOpen(false)} className="text-gray-500 hover:text-red-600 transition-colors bg-gray-100 p-2 rounded-full cursor-pointer"><X size={20} /></button>
            </div>

            <div className="p-3 sm:p-6 overflow-y-auto overflow-x-auto flex-1 flex justify-center bg-gray-100 custom-scrollbar responsive-table-container">

              <div id="shipping-label-content" className="bg-white p-4 sm:p-8 w-full max-w-xl text-black font-sans shadow-lg border border-gray-200 h-max shrink-0">
                <div className="flex justify-between items-start pb-4 border-b-2 border-black">
                  <div className="flex-1 pt-2">
                    <h3 className="text-base font-extrabold text-black tracking-wide mb-3">Shipping Label</h3>
                    <p className="font-extrabold text-[15px] mb-1 text-black">Shipping To:</p>
                    <p className="text-[15px] font-black text-black tracking-wide break-words max-w-[360px] leading-snug">{shippingOrder.name}</p>
                    <p className="text-[15px] font-extrabold mt-1 text-black">Phone: {formatPhoneNumber(shippingOrder.phone)}</p>
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    <div className="w-36 h-36 rounded-2xl overflow-hidden shadow-md border border-amber-900/30 bg-[#0f0e0f] flex items-center justify-center">
                      <img src="/sabi-logo.png" alt="Logo" className="w-full h-full object-cover rounded-2xl" crossOrigin="anonymous" onError={(e) => (e.currentTarget.style.display = "none")} />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center py-3 border-b-2 border-black">
                  <div>
                    <p className="text-[14px] font-extrabold mb-1 text-black">Invoice No: {getSerial(shippingOrder.id)}</p>
                    <p className="text-[14px] font-extrabold mb-1 text-black">Invoice Date: {shippingOrder.deliveryDate || shippingOrder.functionDate || shippingOrder.orderDate || new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</p>
                    <p className="text-[14px] font-extrabold mb-1 text-black">Item: {shippingOrder.chocolate}</p>
                    <p className="text-[14px] font-extrabold text-black">Qty: {shippingOrder.count}</p>
                  </div>
                  <div className="flex flex-col items-center">
                    <img src={`https://bwipjs-api.metafloor.com/?bcid=code128&text=${getSerial(shippingOrder.id)}&scale=2&height=10`} alt="Barcode" className="h-12 w-auto mix-blend-multiply" crossOrigin="anonymous" />
                    <p className="text-[8px] font-extrabold mt-0.5 tracking-wider">{getSerial(shippingOrder.id)}</p>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-[14px] font-extrabold mb-1 text-black">Sender Details:</p>
                  <p className="text-[14px] font-extrabold text-black">Sabi Return Gifts</p>
                  <p className="text-[14px] font-extrabold text-black leading-snug">No.2/35 ayyavupuram, 57th st street, West k.k.nagar, near pondicherry guest house</p>
                  <p className="text-[14px] font-extrabold text-black">Chennai City South, TAMIL NADU</p>
                  <p className="text-[14px] font-extrabold mb-2 text-black">600078</p>
                  <p className="text-[14px] font-extrabold text-black">Phone: 8220638753</p>
                </div>
              </div>

            </div>

            <div className="p-5 bg-white border-t border-gray-200 rounded-b-3xl flex justify-end gap-4 shadow-[0_-5px_15px_rgba(0,0,0,0.05)] z-10">
              <button onClick={() => setIsShippingOpen(false)} className="px-6 py-2.5 rounded-xl font-bold border-2 border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors">Close</button>
              <button onClick={handleDownloadShipping} className="px-8 py-2.5 rounded-xl font-extrabold text-white bg-purple-600 hover:bg-purple-700 shadow-md hover:shadow-lg transition-all flex items-center gap-2 tracking-wide">
                <Download size={20} /> Download Label
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 🟢 TRASH BIN MODAL */}
      {isTrashOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-3 sm:p-4 backdrop-blur-md cursor-pointer"
          onClick={() => setIsTrashOpen(false)}
        >
          <div
            style={{ backgroundColor: '#0c1427', color: '#ffffff' }}
            className="rounded-3xl shadow-2xl w-full max-w-4xl p-4 sm:p-7 bg-[#0c1427] border border-white/20 overflow-y-auto max-h-[90dvh] relative flex flex-col gap-4 text-white cursor-default custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setIsTrashOpen(false)}
              className="absolute top-5 right-5 p-1 text-slate-300 hover:text-white rounded-full transition-colors cursor-pointer"
            >
              <X size={22} />
            </button>

            <div style={{ backgroundColor: '#131c2e' }} className="flex items-center gap-2.5 p-4 rounded-2xl bg-[#131c2e] border border-white/15 shadow-md">
              <Trash2 size={24} className="text-rose-400" />
              <h2 className="text-xl font-black text-amber-400 uppercase tracking-widest">Trash Bin</h2>
            </div>

            {/* Banner/Info message */}
            <div style={{ backgroundColor: '#131c2e' }} className="bg-[#131c2e] border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3 shadow-md text-white text-xs">
              <span className="shrink-0 text-amber-400 font-bold text-base">ℹ️</span>
              <div>
                <p className="font-black text-amber-400 uppercase tracking-wider text-xs">Auto-Cleanup Policy</p>
                <p className="font-bold text-slate-300 mt-1">
                  All deleted orders are temporarily moved here. Items in the trash are automatically deleted forever after <strong className="text-amber-300 font-mono font-black">30 days</strong>.
                </p>
              </div>
            </div>

            {/* Trash Orders Table */}
            <div style={{ backgroundColor: '#131c2e' }} className="overflow-x-auto rounded-2xl border border-white/15 bg-[#131c2e] shadow-xl custom-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr style={{ backgroundColor: '#162035' }} className="bg-[#162035] text-amber-400 uppercase tracking-wider font-black text-xs border-b border-amber-500/30">
                    <th className="p-3.5 border-r border-white/10">Customer</th>
                    <th className="p-3.5 border-r border-white/10">Order Details</th>
                    <th className="p-3.5 border-r border-white/10">Deleted By</th>
                    <th className="p-3.5 text-center border-r border-white/10">Time Left</th>
                    <th className="p-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {trashOrders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-amber-400 font-extrabold italic">
                        Trash is empty
                      </td>
                    </tr>
                  ) : (
                    trashOrders.map((order, idx) => {
                      const daysLeft = 30 - Math.ceil((Date.now() - (order.deletedAt || Date.now())) / (24 * 60 * 60 * 1000));
                      const isUrgent = daysLeft <= 5;
                      const daysLabel = daysLeft <= 0 ? "Expired" : `${daysLeft} days remaining`;

                      return (
                        <tr key={idx} className={`border-b border-white/5 text-xs transition-colors ${idx % 2 === 0 ? 'bg-[#0f172a]' : 'bg-[#131c2e]'} hover:bg-[#18243b]`}>
                          <td className="p-3.5 border-r border-white/5">
                            <div className="font-extrabold text-white text-sm">{order.name}</div>
                            <div className="text-slate-400 font-mono text-xs">{formatPhoneNumber(order.phone)}</div>
                          </td>
                          <td className="p-3.5 border-r border-white/5">
                            <div className="font-extrabold text-slate-200 text-xs">{order.chocolate || order.productName || "Product"}</div>
                            <div className="text-slate-400 mt-0.5">
                              Qty: <strong className="text-amber-300 font-mono font-black">{order.count}</strong> | Total: <strong className="text-emerald-300 font-mono font-black">₹{(order.totalOrderPrice || 0).toLocaleString()}</strong>
                            </div>
                          </td>
                          <td className="p-3.5 border-r border-white/5">
                            <div className="flex flex-col gap-1 items-start">
                              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black border ${order.deletedBy && (order.deletedBy.includes("Admin") || order.deletedBy === "Subash")
                                ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                                : "bg-purple-500/20 text-purple-300 border-purple-500/30"
                                }`}>
                                <User size={10} />
                                {order.deletedBy || "Unknown"}
                              </span>
                              {order.deletedAt && (
                                <div className="text-[10px] text-slate-400 font-mono font-bold mt-0.5">
                                  {new Date(order.deletedAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 text-center border-r border-white/5">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black border ${isUrgent
                              ? "bg-rose-500/20 text-rose-300 border-rose-500/30 animate-pulse"
                              : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                              }`}>
                              {daysLabel}
                            </span>
                          </td>
                          <td className="p-3.5 text-right">
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => handleRestoreTrashOrder(order)}
                                className="px-3 py-1.5 rounded-lg border border-emerald-500/40 text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500 hover:text-black font-black uppercase text-[10px] transition-all cursor-pointer shadow-sm"
                                title="Restore Order"
                              >
                                Restore
                              </button>
                              <button
                                onClick={() => handleDeleteTrashOrderPermanently(order.fireId)}
                                className="px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-300 bg-rose-500/10 hover:bg-rose-600 hover:text-white font-black uppercase text-[10px] transition-all cursor-pointer shadow-sm"
                                title="Delete Permanently"
                              >
                                Delete Forever
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ backgroundColor: '#131c2e' }} className="pt-3 flex justify-end border-t border-white/10">
              <button
                onClick={() => setIsTrashOpen(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
              >
                Close Trash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🟣 HISTORY MODAL */}
      {isHistoryOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-3 sm:p-4 print:hidden backdrop-blur-sm"
          onClick={() => setIsHistoryOpen(false)}
        >
          <div
            className="rounded-2xl shadow-2xl w-full max-w-4xl bg-[#0f172a] overflow-hidden border border-indigo-900/60 relative flex flex-col max-h-[90dvh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 border-b border-indigo-700/50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                  <History size={18} className="text-indigo-300" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white tracking-tight">Platform History</h2>
                  <p className="text-xs text-indigo-300 font-medium">Live users & all platform changes</p>
                </div>
              </div>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="p-2 text-indigo-300 hover:bg-indigo-800/60 rounded-xl transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tab Switcher */}
            <div className="flex shrink-0 bg-slate-900/80 border-b border-slate-700/60">
              <button
                onClick={() => setHistoryTab('users')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-all ${historyTab === 'users'
                  ? 'bg-indigo-600/20 text-indigo-300 border-b-2 border-indigo-400'
                  : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                <User size={15} />
                Logged In Users
                <span className="ml-1 px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full text-[10px] font-black">
                  {1 + employees.filter(e => e.status === 'Approved' && e.isLive && e.lastActive && (Date.now() - new Date(e.lastActive).getTime() < 90000)).length}
                </span>
              </button>
              <button
                onClick={() => setHistoryTab('activity')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold transition-all ${historyTab === 'activity'
                  ? 'bg-indigo-600/20 text-indigo-300 border-b-2 border-indigo-400'
                  : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                <Clock size={15} />
                Change History
                <span className="ml-1 px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded-full text-[10px] font-black">
                  {activityLogs.length}
                </span>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">

              {/* === TAB 1: LOGGED IN USERS === */}
              {historyTab === 'users' && (
                <div className="p-6 space-y-4">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest">Currently active on this platform</p>

                  {/* Admin Card */}
                  <div className="flex items-center gap-4 bg-gradient-to-r from-amber-900/30 to-amber-800/10 border border-amber-700/30 rounded-2xl p-4">
                    <div className="w-11 h-11 rounded-xl bg-amber-500/20 flex items-center justify-center border border-amber-500/30 shrink-0">
                      <User size={20} className="text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-amber-200 text-base">Subash</span>
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-black uppercase">Admin</span>
                        {role === 'Admin' && isLoggedIn && (
                          <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black px-2 py-0.5 rounded-full uppercase animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Live
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 font-medium mt-0.5">Username: <span className="text-amber-300 font-bold">subash g</span></p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[10px] text-slate-500 font-semibold">Role</p>
                      <p className="text-xs text-amber-300 font-black">Administrator</p>
                    </div>
                  </div>

                  {/* Approved Employees */}
                  {employees
                    .filter(e => e.status === 'Approved')
                    .map(emp => {
                      const isLive = emp.isLive && emp.lastActive && (Date.now() - new Date(emp.lastActive).getTime() < 90000);
                      return (
                        <div
                          key={emp.fireId}
                          className={`flex items-center gap-4 rounded-2xl p-4 border transition-all ${isLive
                            ? 'bg-gradient-to-r from-emerald-900/30 to-emerald-800/10 border-emerald-700/30'
                            : 'bg-slate-800/40 border-slate-700/40'
                            }`}
                        >
                          <div className={`w-11 h-11 rounded-xl flex items-center justify-center border shrink-0 ${isLive ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-slate-700/50 border-slate-600/40'
                            }`}>
                            <User size={20} className={isLive ? 'text-emerald-400' : 'text-slate-500'} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`font-black text-base ${isLive ? 'text-emerald-200' : 'text-slate-400'}`}>{emp.name}</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase border ${isLive ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-slate-700/50 text-slate-500 border-slate-600/40'
                                }`}>Employee</span>
                              {isLive ? (
                                <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-black px-2 py-0.5 rounded-full uppercase animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Live
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[9px] bg-slate-700/50 text-slate-500 border border-slate-600/40 font-black px-2 py-0.5 rounded-full uppercase">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Offline
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">Username: <span className={`font-bold ${isLive ? 'text-emerald-300' : 'text-slate-400'}`}>{emp.username}</span></p>
                            {emp.lastLoginAt && (
                              <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                                Last login: {new Date(emp.lastLoginAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] text-slate-500 font-semibold">Status</p>
                            <p className={`text-xs font-black ${isLive ? 'text-emerald-400' : 'text-slate-500'}`}>{isLive ? 'Online' : 'Offline'}</p>
                          </div>
                        </div>
                      );
                    })}

                  {employees.filter(e => e.status === 'Approved').length === 0 && (
                    <div className="text-center py-8 text-slate-500 font-bold text-sm">
                      No approved employees yet.
                    </div>
                  )}
                </div>
              )}

              {/* === TAB 2: ACTIVITY LOG === */}
              {historyTab === 'activity' && (
                <div className="flex flex-col h-full">
                  {/* Filter Bar */}
                  <div className="px-6 py-3 bg-slate-900/60 border-b border-slate-700/40 flex items-center gap-2 shrink-0 flex-wrap">
                    <Filter size={13} className="text-slate-400" />
                    <span className="text-xs text-slate-400 font-bold mr-1">Module:</span>
                    {['All', 'Order Management (Chocolates)', 'Order Management (Products)', 'Inventories', 'Products', 'Chocolates', 'Employees', 'Daily Tasks', 'Trash Bin'].map(mod => (
                      <button
                        key={mod}
                        onClick={() => setHistoryModuleFilter(mod)}
                        className={`text-[10px] px-2.5 py-1 rounded-full font-bold border transition-all ${historyModuleFilter === mod
                          ? 'bg-indigo-600/30 text-indigo-300 border-indigo-500/50'
                          : 'bg-slate-800/60 text-slate-400 border-slate-700/40 hover:text-slate-200'
                          }`}
                      >
                        {mod === 'All' ? 'All'
                          : mod === 'Order Management (Chocolates)' ? 'Choc Orders'
                            : mod === 'Order Management (Products)' ? 'Prod Orders'
                              : mod}
                      </button>
                    ))}
                  </div>

                  {/* Log Table */}
                  <div className="overflow-x-auto flex-1">
                    {activityLogs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                        <History size={40} className="mb-3 opacity-30" />
                        <p className="font-bold text-sm">No activity recorded yet</p>
                        <p className="text-xs mt-1 opacity-60">Actions on this platform will appear here</p>
                      </div>
                    ) : (
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0">
                          <tr className="bg-slate-800/90 text-slate-400 uppercase tracking-widest text-[10px] font-black border-b border-slate-700/60">
                            <th className="px-4 py-3">#</th>
                            <th className="px-4 py-3">Action</th>
                            <th className="px-4 py-3">Module</th>
                            <th className="px-4 py-3">By</th>
                            <th className="px-4 py-3 whitespace-nowrap">Date & Time</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {activityLogs
                            .filter(log => historyModuleFilter === 'All' || log.module === historyModuleFilter)
                            .map((log, idx) => {
                              const actionLower = (log.action || '').toLowerCase();
                              const isAdd = actionLower.startsWith('added') || actionLower.startsWith('registered');
                              const isEdit = actionLower.startsWith('edited');
                              const isDelete = actionLower.startsWith('deleted') || actionLower.startsWith('permanently');
                              const isRestore = actionLower.startsWith('restored');
                              const actionColor = isAdd ? 'text-emerald-400' : isEdit ? 'text-amber-400' : isDelete ? 'text-red-400' : isRestore ? 'text-blue-400' : 'text-slate-300';
                              const actionBg = isAdd ? 'bg-emerald-500/10 border-emerald-500/20' : isEdit ? 'bg-amber-500/10 border-amber-500/20' : isDelete ? 'bg-red-500/10 border-red-500/20' : isRestore ? 'bg-blue-500/10 border-blue-500/20' : 'bg-slate-700/20 border-slate-600/20';
                              const dot = isAdd ? 'bg-emerald-400' : isEdit ? 'bg-amber-400' : isDelete ? 'bg-red-400' : isRestore ? 'bg-blue-400' : 'bg-slate-400';
                              return (
                                <tr key={log.fireId || idx} className="hover:bg-slate-800/40 transition-colors">
                                  <td className="px-4 py-3 text-slate-600 text-xs font-bold">{idx + 1}</td>
                                  <td className="px-4 py-3">
                                    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs font-bold ${actionBg}`}>
                                      <span className={`w-1.5 h-1.5 rounded-full ${dot} shrink-0`}></span>
                                      <span className={actionColor}>{log.action || '—'}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className="text-[10px] text-slate-400 font-semibold">{log.module || '—'}</span>
                                  </td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${log.role === 'Admin' ? 'bg-amber-500/20' : 'bg-indigo-500/20'
                                        }`}>
                                        <User size={10} className={log.role === 'Admin' ? 'text-amber-400' : 'text-indigo-400'} />
                                      </div>
                                      <div>
                                        <p className={`text-xs font-black ${log.role === 'Admin' ? 'text-amber-300' : 'text-indigo-300'}`}>{log.username || log.performedBy || '—'}</p>
                                        <p className="text-[10px] text-slate-500 font-semibold">{log.role || '—'}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap">
                                    <p className="text-xs text-slate-300 font-bold">
                                      {log.timestamp ? new Date(log.timestamp).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                                    </p>
                                  </td>
                                  <td className="px-4 py-3 whitespace-nowrap text-right flex items-center justify-end gap-2">
                                    {(actionLower.startsWith('deleted order:') ||
                                      actionLower.startsWith('added new order:') ||
                                      actionLower.startsWith('added new product:') ||
                                      actionLower.startsWith('deleted product:') ||
                                      actionLower.startsWith('added chocolate:') ||
                                      actionLower.startsWith('deleted chocolate:')) && (
                                        <button
                                          onClick={() => handleUndoActivity(log)}
                                          className="p-1 text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 font-bold text-[9px] uppercase border border-indigo-500/20 px-2 py-1 shadow-sm"
                                          title="Undo/Revert Action"
                                        >
                                          <RotateCcw size={10} /> Undo
                                        </button>
                                      )}
                                    <button
                                      onClick={async () => {
                                        const logToDelete = { ...log };
                                        const logFireId = log.fireId;
                                        delete (logToDelete as any).fireId;
                                        try {
                                          await deleteDoc(doc(db, "activity_logs", logFireId));
                                          toast.success("History log deleted", {
                                            action: {
                                              label: "Undo",
                                              onClick: async () => {
                                                await setDoc(doc(db, "activity_logs", logFireId), logToDelete);
                                                toast.success("History log restored!");
                                              }
                                            }
                                          });
                                        } catch (e) {
                                          toast.error("Failed to delete log entry");
                                        }
                                      }}
                                      className="p-1.5 text-slate-450 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                                      title="Delete Log"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-slate-900/80 border-t border-slate-700/40 flex justify-between items-center shrink-0">
              <p className="text-xs text-slate-500 font-semibold">
                {activityLogs.length} total actions logged
              </p>
              <button
                onClick={() => setIsHistoryOpen(false)}
                className="px-5 py-2 rounded-xl font-bold text-xs text-slate-300 bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/40 transition-all active:scale-95"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 NEW: REPORT PREVIEW & DOWNLOAD MODAL */}
      {isReportPreviewOpen && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm" onClick={() => setIsReportPreviewOpen(false)}>
          <div style={{ backgroundColor: '#0c1427', color: '#ffffff' }} className="bg-[#0c1427] rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90dvh] flex flex-col overflow-hidden border border-white/20 text-white" onClick={(e) => e.stopPropagation()}>
            <div style={{ backgroundColor: '#131c2e' }} className="p-4 sm:p-5 border-b border-white/15 flex justify-between items-center bg-[#131c2e] shadow-md">
              <h2 className="text-xl sm:text-2xl font-black text-amber-400 uppercase tracking-widest">Sales Report Preview</h2>
              <button onClick={() => setIsReportPreviewOpen(false)} className="text-slate-300 hover:bg-red-950/60 hover:text-red-400 p-2 rounded-full transition-colors cursor-pointer"><X size={22} /></button>
            </div>

            <div id="final-report-document" style={{ backgroundColor: '#090e1a', color: '#ffffff' }} className="p-4 sm:p-8 overflow-auto bg-[#090e1a] flex-1 relative custom-scrollbar responsive-table-container">
              <div className="text-center mb-8">
                <h1 className="text-3xl font-black text-amber-400 uppercase tracking-wider drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]">Sabi Return Gifts</h1>
                <h2 className="text-lg font-extrabold text-slate-200 mt-1">Official Sales & Analytics Report</h2>
                {reportDateRange.start && reportDateRange.end ? (
                  <p className="text-xs font-bold text-slate-400 mt-1">Period: {formatToDisplayDate(reportDateRange.start)} to {formatToDisplayDate(reportDateRange.end)}</p>
                ) : (
                  <p className="text-xs font-bold text-slate-400 mt-1">Period: All Time Overview</p>
                )}

                {/* Dashboard Type Subtitle inside Report */}
                {reportDashboardFilter !== 'All' && (
                  <p className="text-xs font-black text-amber-300 uppercase tracking-widest mt-2 bg-amber-500/15 px-3.5 py-1 rounded-full border border-amber-500/30 inline-block">
                    Filter: {reportDashboardFilter === 'Dashboard 1' ? 'Chocolates Only' : 'Products Only'}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                <div className="border border-white/15 p-4 rounded-2xl bg-[#131c2e] text-center shadow-md">
                  <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Total Orders</p>
                  <p className="text-2xl font-black text-white font-mono mt-1">{reportData.filteredOrders.length}</p>
                </div>
                <div className="border border-white/15 p-4 rounded-2xl bg-[#131c2e] text-center shadow-md">
                  <p className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">Items Sold</p>
                  <p className="text-2xl font-black text-white font-mono mt-1">{reportData.totalItems}</p>
                </div>
                <div className="border border-amber-500/30 p-4 rounded-2xl bg-[#131c2e] text-center shadow-md">
                  <p className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">Total Revenue Generated</p>
                  <p className="text-2xl font-black text-amber-300 font-mono mt-1 drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]">₹{reportData.totalRev.toLocaleString()}</p>
                </div>
                <div className="border border-emerald-500/30 p-4 rounded-2xl bg-[#131c2e] text-center shadow-md">
                  <p className="text-xs font-extrabold text-emerald-400 uppercase tracking-wider">Total Profit</p>
                  <p className="text-2xl font-black text-emerald-300 font-mono mt-1 drop-shadow-[0_0_10px_rgba(16,185,129,0.4)]">₹{Math.round(reportData.totalProfit || 0).toLocaleString()}</p>
                </div>
              </div>

              <div className="mb-8">
                <h3 className="text-xl font-black text-amber-400 border-b border-white/15 pb-3 mb-5 tracking-wide uppercase flex items-center gap-2">
                  Top Selling {reportDashboardFilter === 'Dashboard 2' ? 'Products' : 'Chocolates'} Leaderboard
                </h3>
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr style={{ backgroundColor: '#162035' }} className="bg-[#162035] text-amber-400 text-xs font-black uppercase tracking-wider">
                      <th className="p-3.5 border border-white/10 w-16 text-center">Rank</th>
                      <th className="p-3.5 border border-white/10">Item Name</th>
                      <th className="p-3.5 border border-white/10 text-center w-36">Units Sold</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.topChocs.map(([name, count], idx) => (
                      <tr key={idx} className={`border-b border-white/5 text-sm transition-colors ${idx % 2 === 0 ? 'bg-[#0f172a]' : 'bg-[#131c2e]'} hover:bg-[#18243b]`}>
                        <td className="p-3.5 border border-white/5 text-center font-black text-amber-400">#{idx + 1}</td>
                        <td className="p-3.5 border border-white/5 font-extrabold text-white">{name}</td>
                        <td className="p-3.5 border border-white/5 text-center font-mono font-black text-amber-300">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ backgroundColor: '#131c2e' }} className="p-4 border-t border-white/15 bg-[#131c2e] flex justify-end gap-4 shadow-2xl">
              <button onClick={() => setIsReportPreviewOpen(false)} className="px-6 py-2.5 rounded-xl font-extrabold border border-white/20 text-slate-300 hover:bg-white/10 hover:text-white transition-all cursor-pointer">Cancel</button>
              <button
                onClick={async () => {
                  const element = document.getElementById("final-report-document");
                  if (element) {
                    const html2canvas = (await import("html2canvas")).default;
                    const canvas = await html2canvas(element, { scale: 2, useCORS: true });
                    const link = document.createElement("a");
                    link.download = `Sabi_Sales_Report_${new Date().getTime()}.png`;
                    link.href = canvas.toDataURL("image/png");
                    link.click();
                  }
                }}
                className="px-6 py-2.5 rounded-xl font-black text-black bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 flex items-center gap-2 shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
              >
                <Download size={18} /> Download Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 NEW: REPORTS AUTHENTICATION MODAL */}
      {isReportsAuthModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsReportsAuthModalOpen(false)}>
          <div
            style={{ backgroundColor: '#0c1427', color: '#ffffff' }}
            className="bg-[#0c1427] rounded-3xl shadow-2xl w-full max-w-sm border border-white/20 overflow-hidden transform transition-all animate-in zoom-in-95 duration-200 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-[#131c2e] to-[#090e1a] p-6 text-center relative border-b border-amber-500/30">
              <button type="button" onClick={() => setIsReportsAuthModalOpen(false)} className="absolute top-4 right-4 text-slate-300 hover:text-white transition-colors cursor-pointer"><X size={20} /></button>
              <div className="w-16 h-16 bg-[#162035] rounded-2xl mx-auto flex items-center justify-center shadow-md border border-amber-500/30 mb-3">
                <Lock size={26} className="text-amber-400" strokeWidth={2.5} />
              </div>
              <h2 className="text-2xl font-black text-white tracking-wide uppercase">Enter Password</h2>
              <p className="text-amber-400/90 text-xs font-bold mt-1 tracking-widest uppercase">Restricted Reports Area</p>
            </div>

            <form onSubmit={handleReportsAuthSubmit} className="p-7 space-y-5 bg-[#090e1a]">
              {reportsAuthError && (
                <div className="bg-red-950/60 border-l-4 border-red-500 text-red-300 p-3 text-xs font-bold rounded-lg shadow-sm text-center animate-in zoom-in duration-200">
                  {reportsAuthError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2">Reports Password</label>
                  <input
                    type="password"
                    value={reportsPassword}
                    onChange={(e) => setReportsPassword(e.target.value)}
                    style={{ backgroundColor: '#162035', color: '#ffffff' }}
                    className="w-full font-mono font-black text-center text-xl rounded-xl p-3 border border-white/20 focus:border-amber-400 bg-[#162035] text-white outline-none shadow-inner"
                    placeholder="••••"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-black uppercase tracking-widest rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <Lock size={18} /> Unlock Reports
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 🟢 NEW: HISTORY AUTHENTICATION MODAL */}
      {isHistoryAuthModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsHistoryAuthModalOpen(false)}>
          <div
            className="bg-[#fffcf9] rounded-[2rem] shadow-2xl w-full max-w-sm border-2 border-indigo-100 overflow-hidden transform transition-all animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 p-6 text-center relative border-b-4 border-indigo-950">
              <button type="button" onClick={() => setIsHistoryAuthModalOpen(false)} className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"><X size={20} /></button>
              <div className="w-16 h-16 bg-[#fffcf9] rounded-full mx-auto flex items-center justify-center shadow-inner mb-3">
                <Lock size={28} className="text-indigo-800" strokeWidth={2.5} />
              </div>
              <h2 className="text-2xl font-black text-white tracking-wide">Enter Password</h2>
              <p className="text-indigo-200/80 text-xs font-bold mt-1 tracking-widest uppercase">Restricted History Area</p>
            </div>

            <form onSubmit={handleHistoryAuthSubmit} className="p-7 space-y-5">
              {historyAuthError && (
                <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 text-sm font-bold rounded shadow-sm text-center animate-in zoom-in duration-200">
                  {historyAuthError}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-indigo-900 uppercase tracking-wider mb-1.5">History Password</label>
                  <input
                    type="password"
                    value={historyPassword}
                    onChange={(e) => setHistoryPassword(e.target.value)}
                    className="w-full font-bold text-center text-lg rounded-xl p-3 border-2 border-indigo-200 focus:border-indigo-600 bg-white text-black outline-none shadow-inner"
                    placeholder="••••"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl border-b-4 border-indigo-900 active:border-b-0 hover:-translate-y-0.5 active:translate-y-1 transition-all shadow-md uppercase tracking-wider text-xs"
              >
                Access History
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 🟢 NEW: PASSCODE SETTINGS MODAL */}
      {isPasscodeSettingsOpen && (
        <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsPasscodeSettingsOpen(false)}>
          <div
            className="bg-[#fffcf9] rounded-[2rem] shadow-2xl w-full max-w-sm border-2 border-indigo-100 overflow-hidden transform transition-all animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-indigo-700 to-indigo-900 p-6 text-center relative border-b-4 border-indigo-950">
              <button type="button" onClick={() => setIsPasscodeSettingsOpen(false)} className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"><X size={20} /></button>
              <div className="w-16 h-16 bg-[#fffcf9] rounded-full mx-auto flex items-center justify-center shadow-inner mb-3">
                <Lock size={28} className="text-indigo-800" strokeWidth={2.5} />
              </div>
              <h2 className="text-2xl font-black text-white tracking-wide">Passcode Settings</h2>
              <p className="text-indigo-200/80 text-xs font-bold mt-1 tracking-widest uppercase">Security Controls</p>
            </div>

            <div className="p-7 space-y-6">
              {/* Reports Passcode Input */}
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-indigo-900 uppercase tracking-wider mb-1">Reports Passcode</label>
                <input
                  type="text"
                  value={tempReportsPasscode}
                  onChange={(e) => setTempReportsPasscode(e.target.value.trim())}
                  className="w-full font-bold text-center text-lg rounded-xl p-2.5 border-2 border-indigo-100 focus:border-indigo-600 bg-white text-black outline-none shadow-inner"
                  placeholder="e.g. 963"
                  required
                />
                <p className="text-[10px] text-slate-500 font-semibold mt-1">Current Passcode: <span className="font-bold text-indigo-700">{reportsPasscode}</span></p>
              </div>

              {/* History Passcode Input */}
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-indigo-900 uppercase tracking-wider mb-1">History Passcode</label>
                <input
                  type="text"
                  value={tempHistoryPasscode}
                  onChange={(e) => setTempHistoryPasscode(e.target.value.trim())}
                  className="w-full font-bold text-center text-lg rounded-xl p-2.5 border-2 border-indigo-100 focus:border-indigo-600 bg-white text-black outline-none shadow-inner"
                  placeholder="e.g. 852"
                  required
                />
                <p className="text-[10px] text-slate-500 font-semibold mt-1">Current Passcode: <span className="font-bold text-indigo-700">{historyPasscode}</span></p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPasscodeSettingsOpen(false)}
                  className="flex-1 py-2.5 text-xs font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-xl transition-all border border-slate-200 shadow-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!tempReportsPasscode || !tempHistoryPasscode) {
                      toast.error("Passcodes cannot be empty!");
                      return;
                    }
                    try {
                      const passcodeRef = doc(db, 'daily_tasks_board', 'passcodes');
                      await setDoc(passcodeRef, {
                        reports: tempReportsPasscode,
                        history: tempHistoryPasscode
                      });
                      toast.success("Passcodes updated successfully!");
                      setIsPasscodeSettingsOpen(false);
                    } catch (err) {
                      console.error("Failed to save passcodes:", err);
                      toast.error("Failed to update passcodes");
                    }
                  }}
                  className="flex-1 py-3 text-xs font-black text-black bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 rounded-xl transition-all shadow-lg"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 NEW: ADMIN AUTHENTICATION MODAL */}
      {isAdminAuthModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-[110] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsAdminAuthModalOpen(false)}>
          <div
            style={{ backgroundColor: '#0c1427', color: '#ffffff' }}
            className="bg-[#0c1427] rounded-3xl shadow-2xl w-full max-w-sm border border-white/20 overflow-hidden transform transition-all text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-br from-[#131c2e] to-[#090e1a] p-6 text-center relative border-b border-amber-500/30">
              <button type="button" onClick={() => setIsAdminAuthModalOpen(false)} className="absolute top-4 right-4 text-slate-300 hover:text-white transition-colors cursor-pointer"><X size={20} /></button>
              <div className="w-16 h-16 bg-[#162035] rounded-2xl mx-auto flex items-center justify-center shadow-md border border-amber-500/30 mb-3">
                <User size={26} className="text-amber-400" strokeWidth={2.5} />
              </div>
              <h2 className="text-2xl font-black text-white tracking-wide uppercase">Login</h2>
              <p className="text-amber-400/90 text-xs font-bold mt-1 tracking-widest uppercase">Restricted Analytics Area</p>
            </div>

            <form onSubmit={handleAdminLogin} className="p-7 space-y-5 bg-[#090e1a]">
              {authError && (
                <div className="bg-red-950/60 border-l-4 border-red-500 text-red-300 p-3 text-xs font-bold rounded-lg shadow-sm text-center animate-in zoom-in duration-200">
                  {authError}
                </div>
              )}

              <div>
                <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-2">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3.5 text-amber-400" size={18} />
                  <input
                    type="password"
                    required
                    value={adminCreds.password}
                    onChange={(e) => setAdminCreds({ ...adminCreds, password: e.target.value })}
                    style={{ backgroundColor: '#162035', color: '#ffffff' }}
                    className="w-full pl-10 pr-4 py-3 bg-[#162035] border border-white/20 rounded-xl outline-none focus:border-amber-400 font-bold text-white transition-colors placeholder-slate-400"
                    placeholder="Enter Password"
                  />
                </div>
              </div>

              <button type="submit" className="w-full py-3.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-black uppercase tracking-widest rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 mt-4">
                <Lock size={18} /> Login securely
              </button>
            </form>
          </div>
        </div>
      )}

      {/* 🟢 NEW: EMPLOYEE APPROVAL MODAL */}
      {showApprovalPanel && (
        <div className="fixed inset-0 bg-black/80 z-[120] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowApprovalPanel(false)}>
          <div style={{ backgroundColor: '#0c1427', color: '#ffffff' }} className="bg-[#0c1427] rounded-3xl shadow-2xl w-full max-w-2xl border border-white/20 overflow-hidden flex flex-col max-h-[80vh] text-white" onClick={(e) => e.stopPropagation()}>
            <div style={{ backgroundColor: '#131c2e' }} className="p-6 border-b border-white/15 flex justify-between items-center bg-[#131c2e] shadow-md">
              <h2 className="text-xl font-black text-amber-400 flex items-center gap-2 uppercase tracking-wide"><Lock className="text-amber-400" /> Approvals</h2>
              <button onClick={() => setShowApprovalPanel(false)} className="text-slate-300 hover:text-white p-1 rounded-full cursor-pointer transition-colors"><X size={22} /></button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 space-y-8 bg-[#090e1a] custom-scrollbar">
              {/* SECTION 1: PENDING REQUESTS */}
              <div>
                <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest mb-3 pb-2 border-b border-white/10 flex items-center justify-between">
                  <span>Pending Requests ({employees.filter(e => e.status === 'Pending').length})</span>
                </h3>
                {employees.filter(e => e.status === 'Pending').length === 0 ? (
                  <div className="bg-[#131c2e] p-5 rounded-2xl border border-dashed border-amber-500/30 text-center text-amber-300 font-extrabold text-sm">
                    No pending requests.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {employees.filter(e => e.status === 'Pending').map(emp => (
                      <div key={emp.fireId} className="bg-[#131c2e] p-4 rounded-2xl border border-white/10 shadow-md flex justify-between items-center">
                        <div>
                          <p className="font-extrabold text-white text-base">{emp.name}</p>
                          <p className="text-xs font-bold text-slate-300 mt-0.5">Username: <span className="text-amber-300 font-mono">{emp.username}</span> | Password: <span className="text-amber-300 font-mono">{emp.password}</span></p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={async () => { await updateDoc(doc(db, "employees", emp.fireId), { status: 'Approved' }); logActivity(`Approved Employee: ${emp.name} (@${emp.username})`, 'Employees'); }} className="px-3.5 py-1.5 text-xs bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-extrabold rounded-xl transition-colors border border-emerald-500/40 cursor-pointer">Accept</button>
                          <button onClick={async () => { await updateDoc(doc(db, "employees", emp.fireId), { status: 'Declined' }); logActivity(`Declined Employee: ${emp.name} (@${emp.username})`, 'Employees'); }} className="px-3.5 py-1.5 text-xs bg-red-950/40 hover:bg-red-900/60 text-red-400 font-extrabold rounded-xl transition-colors border border-red-500/30 cursor-pointer">Decline</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 2: APPROVED EMPLOYEES */}
              <div>
                <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest mb-3 pb-2 border-b border-white/10 flex items-center justify-between">
                  <span>Approved Employees ({employees.filter(e => e.status === 'Approved').length})</span>
                </h3>
                {employees.filter(e => e.status === 'Approved').length === 0 ? (
                  <div className="bg-[#131c2e] p-5 rounded-2xl border border-dashed border-emerald-500/30 text-center text-emerald-300 font-extrabold text-sm">
                    No approved employees yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {employees.filter(e => e.status === 'Approved').map(emp => {
                      const isLive = emp.isLive && emp.lastActive && (Date.now() - new Date(emp.lastActive).getTime() < 90000);
                      return (
                        <div key={emp.fireId} className="bg-[#131c2e] p-4 rounded-2xl border border-white/10 shadow-md flex justify-between items-center">
                          <div>
                            <p className="font-extrabold text-white text-base">{emp.name}</p>
                            <p className="text-xs font-bold text-slate-300 flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                              <span>Username: <span className="text-amber-300 font-mono">{emp.username}</span></span>
                              <span className="text-slate-500">|</span>
                              <span>Password: <span className="text-amber-300 font-mono">{emp.password}</span></span>
                              {isLive && (
                                <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-black px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Live
                                </span>
                              )}
                            </p>
                            {emp.lastLoginAt && (
                              <p className="text-[10px] font-extrabold text-slate-400 mt-1">
                                Last login: {new Date(emp.lastLoginAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button onClick={async () => { await updateDoc(doc(db, "employees", emp.fireId), { status: 'Declined', isLive: false }); logActivity(`Revoked Access: ${emp.name} (@${emp.username})`, 'Employees'); }} className="px-3.5 py-1.5 text-xs bg-red-950/40 hover:bg-red-900/60 text-red-400 font-extrabold rounded-xl transition-colors border border-red-500/30 cursor-pointer">Revoke Access</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 MANAGED CHOCOLATES & ORDER TYPES MODAL (ANALYTICS AREA) */}
      {isAnalyticsModalOpen && (
        <div
          className="fixed inset-0 bg-black/80 z-[150] flex items-center justify-center p-4 backdrop-blur-md"
          onClick={() => {
            setIsAnalyticsModalOpen(false);
            setEditChocId(null);
            setNewChocForm({ name: "", retailPrice: "", wholesalePrice: "", stickerPrice: "1.5", displayOrder: "" });
            setEditOrderTypeId(null);
            setNewOrderTypeName("");
          }}
        >
          <div
            style={{ backgroundColor: '#0c1427', color: '#ffffff' }}
            className="rounded-3xl shadow-2xl w-full max-w-4xl p-5 sm:p-6 md:p-7 bg-[#0c1427] border border-white/20 flex flex-col max-h-[88vh] my-auto text-white overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header with Tab Navigation */}
            <div
              style={{ backgroundColor: '#131c2e' }}
              className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 border-b border-white/15 p-4 rounded-2xl bg-[#131c2e] shadow-md shrink-0"
            >
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl sm:text-2xl font-black text-amber-400 flex items-center gap-2.5 uppercase tracking-widest">
                  {analyticsActiveTab === 'chocolates' ? (
                    <>
                      <TrendingUp size={24} className="text-amber-400" />
                      <span>Chocolate Master Analytics</span>
                    </>
                  ) : (
                    <>
                      <Tag size={24} className="text-amber-400" />
                      <span>Order Types Management</span>
                    </>
                  )}
                </h2>

                {/* Sub-Tabs Switcher */}
                <div className="flex bg-[#090e1a] p-1 rounded-xl border border-white/10 shadow-inner">
                  <button
                    type="button"
                    onClick={() => {
                      setAnalyticsActiveTab('order_types');
                      setEditChocId(null);
                      setNewChocForm({ name: "", retailPrice: "", wholesalePrice: "", stickerPrice: "1.5", displayOrder: "" });
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                      analyticsActiveTab === 'order_types'
                        ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-black shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Tag size={14} />
                    <span>Order Types</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${analyticsActiveTab === 'order_types' ? 'bg-black/20 text-black' : 'bg-white/10 text-slate-300'}`}>
                      {orderTypes.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAnalyticsActiveTab('chocolates');
                      setEditOrderTypeId(null);
                      setNewOrderTypeName("");
                    }}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
                      analyticsActiveTab === 'chocolates'
                        ? 'bg-gradient-to-r from-amber-400 to-amber-500 text-black shadow-md'
                        : 'text-slate-300 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>🍫 Chocolates</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${analyticsActiveTab === 'chocolates' ? 'bg-black/20 text-black' : 'bg-white/10 text-slate-300'}`}>
                      {managedChocolates.length}
                    </span>
                  </button>
                </div>
              </div>

              <button
                onClick={() => {
                  setIsAnalyticsModalOpen(false);
                  setEditChocId(null);
                  setNewChocForm({ name: "", retailPrice: "", wholesalePrice: "", stickerPrice: "1.5", displayOrder: "" });
                  setEditOrderTypeId(null);
                  setNewOrderTypeName("");
                }}
                className="text-slate-300 hover:text-white p-1 rounded-full cursor-pointer transition-colors self-end sm:self-center"
              >
                <X size={24} />
              </button>
            </div>

            {/* TAB 1: CHOCOLATES MANAGEMENT */}
            {analyticsActiveTab === 'chocolates' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 overflow-hidden">
                {/* Form Section */}
                <div style={{ backgroundColor: '#131c2e' }} className="bg-[#131c2e] p-6 rounded-3xl border border-white/10 shadow-lg h-fit text-white">
                  <h3 className="text-lg font-black text-amber-400 mb-4 flex items-center gap-2 uppercase tracking-wider">
                    <Plus size={18} /> {editChocId ? 'Edit Chocolate' : 'Add New Chocolate'}
                  </h3>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const existingChoc = editChocId ? managedChocolates.find(c => c.fireId === editChocId) : null;
                      const data = {
                        name: newChocForm.name,
                        retailPrice: Number(newChocForm.retailPrice),
                        wholesalePrice: parseFloat(newChocForm.wholesalePrice) || 0,
                        costPrice: existingChoc ? (existingChoc.costPrice || 0) : 0,
                        stickerPrice: parseFloat(newChocForm.stickerPrice) !== undefined ? parseFloat(newChocForm.stickerPrice) : 1.5,
                        displayOrder: newChocForm.displayOrder !== "" ? Number(newChocForm.displayOrder) : ""
                      };
                      if (editChocId) {
                        await updateDoc(doc(db, "managed_chocolates", editChocId), data);
                        logActivity(`Edited Chocolate: ${newChocForm.name} (R:₹${newChocForm.retailPrice} W:₹${newChocForm.wholesalePrice})`, 'Chocolates');
                        setEditChocId(null);
                      } else {
                        await addDoc(collection(db, "managed_chocolates"), data);
                        logActivity(`Added Chocolate: ${newChocForm.name} (R:₹${newChocForm.retailPrice} W:₹${newChocForm.wholesalePrice})`, 'Chocolates');
                      }
                      setNewChocForm({ name: "", retailPrice: "", wholesalePrice: "", stickerPrice: "1.5", displayOrder: "" });
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-1">Chocolate Name</label>
                      <input
                        required
                        type="text"
                        value={newChocForm.name}
                        onChange={(e) => setNewChocForm({ ...newChocForm, name: e.target.value })}
                        style={{ backgroundColor: '#162035', color: '#ffffff' }}
                        className="w-full font-bold rounded-xl p-3 outline-none border border-white/20 focus:border-amber-400 bg-[#162035] text-white placeholder-slate-400 shadow-inner"
                        placeholder="Eg. Munch"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-1">Wholesale Price</label>
                        <input
                          required
                          type="number"
                          step="any"
                          value={newChocForm.wholesalePrice}
                          onChange={(e) => setNewChocForm({ ...newChocForm, wholesalePrice: e.target.value })}
                          style={{ backgroundColor: '#162035', color: '#ffffff' }}
                          className="w-full font-bold rounded-xl p-3 outline-none border border-white/20 focus:border-amber-400 bg-[#162035] text-white placeholder-slate-400 shadow-inner"
                          placeholder="Eg. 18.50"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-1">Retail Price</label>
                        <input
                          required
                          type="number"
                          value={newChocForm.retailPrice}
                          onChange={(e) => setNewChocForm({ ...newChocForm, retailPrice: e.target.value })}
                          style={{ backgroundColor: '#162035', color: '#ffffff' }}
                          className="w-full font-bold rounded-xl p-3 outline-none border border-white/20 focus:border-amber-400 bg-[#162035] text-white placeholder-slate-400 shadow-inner"
                          placeholder="Eg. 20"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-1">Sticker Price</label>
                        <input
                          required
                          type="number"
                          step="any"
                          value={newChocForm.stickerPrice}
                          onChange={(e) => setNewChocForm({ ...newChocForm, stickerPrice: e.target.value })}
                          style={{ backgroundColor: '#162035', color: '#ffffff' }}
                          className="w-full font-bold rounded-xl p-3 outline-none border border-white/20 focus:border-amber-400 bg-[#162035] text-white placeholder-slate-400 shadow-inner"
                          placeholder="Eg. 1.5"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-1">Display Order</label>
                        <input
                          type="number"
                          min="1"
                          value={newChocForm.displayOrder}
                          onChange={(e) => setNewChocForm({ ...newChocForm, displayOrder: e.target.value })}
                          style={{ backgroundColor: '#162035', color: '#ffffff' }}
                          className="w-full font-bold rounded-xl p-3 outline-none border border-white/20 focus:border-amber-400 bg-[#162035] text-white placeholder-slate-400 shadow-inner"
                          placeholder="Eg. 1"
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-3.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-black uppercase tracking-widest rounded-xl shadow-lg hover:scale-105 active:scale-95 transition-all cursor-pointer"
                    >
                      {editChocId ? 'Update Item' : 'Add to List'}
                    </button>

                    {editChocId && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditChocId(null);
                          setNewChocForm({ name: "", retailPrice: "", wholesalePrice: "", stickerPrice: "1.5", displayOrder: "" });
                        }}
                        className="w-full py-2 text-slate-400 hover:text-white font-extrabold text-xs cursor-pointer"
                      >
                        Cancel Edit
                      </button>
                    )}
                  </form>
                </div>

                {/* List Section */}
                <div className="md:col-span-2 overflow-auto custom-scrollbar pr-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {managedChocolates.length === 0 ? (
                      <div className="col-span-full p-8 text-center bg-[#131c2e] rounded-2xl border border-white/10">
                        <TrendingUp size={36} className="text-amber-400 mx-auto mb-2 opacity-60" />
                        <p className="text-slate-200 font-extrabold text-sm">No managed chocolates found.</p>
                        <p className="text-slate-400 text-xs mt-1">Use the form on the left to add chocolates with retail and wholesale prices.</p>
                      </div>
                    ) : (
                      managedChocolates.map((choc) => (
                        <div
                          key={choc.fireId}
                          style={{ backgroundColor: '#131c2e' }}
                          className="bg-[#131c2e] p-4 rounded-2xl border border-white/10 shadow-md flex justify-between items-center group hover:border-amber-500/40 transition-all"
                        >
                          <div>
                            <p className="font-extrabold text-white text-base">{choc.name}</p>
                            <div className="flex flex-wrap gap-2 mt-1.5">
                              <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2.5 py-0.5 rounded-full font-extrabold">W: ₹{choc.wholesalePrice || choc.price}</span>
                              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2.5 py-0.5 rounded-full font-extrabold">R: ₹{choc.retailPrice || choc.price}</span>
                              <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-full font-extrabold">S: ₹{choc.stickerPrice !== undefined ? choc.stickerPrice : (choc.costPrice !== undefined ? choc.costPrice : 1.5)}</span>
                              {choc.displayOrder !== undefined && choc.displayOrder !== null && choc.displayOrder !== "" && (
                                <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-2.5 py-0.5 rounded-full font-extrabold">Order: {choc.displayOrder}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => {
                                setEditChocId(choc.fireId);
                                setNewChocForm({
                                  name: choc.name,
                                  retailPrice: (choc.retailPrice || choc.price || "").toString(),
                                  wholesalePrice: (choc.wholesalePrice || choc.price || "").toString(),
                                  stickerPrice: (choc.stickerPrice !== undefined ? choc.stickerPrice : (choc.costPrice !== undefined ? choc.costPrice : 1.5)).toString(),
                                  displayOrder: (choc.displayOrder !== undefined && choc.displayOrder !== null ? choc.displayOrder : "").toString()
                                });
                              }}
                              className="p-2 text-blue-400 hover:bg-blue-950/60 rounded-xl transition-colors cursor-pointer"
                            >
                              <Pencil size={16} />
                            </button>

                            <button
                              onClick={() => handleDeleteChocClick(choc)}
                              className="p-2 text-rose-400 hover:bg-red-950/60 rounded-xl transition-colors cursor-pointer"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: ORDER TYPES MANAGEMENT */}
            {analyticsActiveTab === 'order_types' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 overflow-y-auto custom-scrollbar p-0.5">
                {/* Left Form Panel: Add / Edit Order Type */}
                <div style={{ backgroundColor: '#131c2e' }} className="lg:col-span-5 h-fit bg-[#131c2e] p-5 sm:p-6 rounded-3xl border border-white/10 shadow-xl text-white">
                  <div>
                    <div className="flex items-center gap-2.5 pb-3 border-b border-white/10 mb-4">
                      <div className="w-8 h-8 rounded-xl bg-amber-400/20 text-amber-400 flex items-center justify-center font-black border border-amber-400/30">
                        {editOrderTypeId ? <Pencil size={16} /> : <Plus size={16} />}
                      </div>
                      <div>
                        <h3 className="text-base font-black text-amber-400 uppercase tracking-wider">
                          {editOrderTypeId ? 'Edit Order Type' : 'Add New Order Type'}
                        </h3>
                        <p className="text-[11px] text-slate-400 font-medium">Create and customize order categories</p>
                      </div>
                    </div>

                    <form onSubmit={handleAddOrderType} className="space-y-4">
                      <div>
                        <label className="block text-xs font-extrabold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                          <span>Order Type Name</span>
                          {editOrderTypeId && <span className="text-amber-400 text-[10px] font-bold">Editing active item</span>}
                        </label>
                        <input
                          required
                          type="text"
                          value={newOrderTypeName}
                          onChange={(e) => setNewOrderTypeName(e.target.value)}
                          style={{ backgroundColor: '#162035', color: '#ffffff' }}
                          className="w-full font-bold rounded-xl p-3.5 outline-none border border-white/20 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 bg-[#162035] text-white placeholder-slate-400 shadow-inner text-sm transition-all"
                          placeholder="e.g. Sabi, Thaaru, Corporate, Custom..."
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-3.5 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-black font-black uppercase tracking-wider rounded-xl shadow-lg hover:scale-[1.02] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 text-xs sm:text-sm"
                      >
                        {editOrderTypeId ? <CheckCircle2 size={18} /> : <Plus size={18} />}
                        <span>{editOrderTypeId ? 'Update Order Type' : 'Add Order Type'}</span>
                      </button>

                      {editOrderTypeId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditOrderTypeId(null);
                            setNewOrderTypeName("");
                          }}
                          className="w-full py-2 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl font-bold text-xs cursor-pointer transition-colors"
                        >
                          Cancel Edit
                        </button>
                      )}
                    </form>
                  </div>
                </div>

                {/* Right Panel: Active Order Types List */}
                <div style={{ backgroundColor: '#131c2e' }} className="lg:col-span-7 bg-[#131c2e] p-5 sm:p-6 rounded-3xl border border-white/10 shadow-xl flex flex-col justify-between text-white overflow-hidden">
                  <div className="flex-1 flex flex-col">
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 border-b border-white/10 mb-4">
                      <div className="flex items-center gap-2">
                        <Tag size={18} className="text-amber-400" />
                        <h3 className="text-base font-black text-amber-400 uppercase tracking-wider">
                          Active Order Types
                        </h3>
                        <span className="bg-amber-400/20 text-amber-300 border border-amber-400/30 text-[11px] font-black px-2 py-0.5 rounded-full">
                          {orderTypes.length}
                        </span>
                      </div>
                      <span className="text-xs font-black text-slate-300 bg-[#090e1a] px-3 py-1 rounded-xl border border-white/10">
                        Total Orders: <strong className="text-amber-400 font-mono font-black">{orders.length}</strong>
                      </span>
                    </div>

                    {/* Order Types Cards List */}
                    <div className="space-y-2.5 overflow-y-auto custom-scrollbar max-h-[330px] pr-1 flex-1">
                      {orderTypes.length === 0 ? (
                        <div className="p-8 text-center bg-[#090e1a]/50 rounded-2xl border border-dashed border-white/10 my-auto">
                          <Tag size={36} className="text-amber-400 mx-auto mb-2 opacity-60" />
                          <p className="text-slate-200 font-extrabold text-sm">No custom order types found.</p>
                          <p className="text-slate-400 text-xs mt-1">Use the form on the left to add order types like Sabi, Thaaru, Corporate, etc.</p>
                        </div>
                      ) : (
                        orderTypes.map((ot, idx) => {
                          const otName = getOrderTypeName(ot) || `Order Type ${idx + 1}`;
                          const otId = getOrderTypeId(ot, idx);
                          const countForType = orders.filter((o: any) => {
                            const typeVal = String(o?.orderType || (o?.role === 'Self' ? 'Sabi' : 'Thaaru') || '').trim().toLowerCase();
                            return typeVal === otName.toLowerCase();
                          }).length;
                          const sharePct = orders.length > 0 ? Math.round((countForType / orders.length) * 100) : 0;
                          const isBeingEdited = editOrderTypeId === otId || editOrderTypeId === otName;

                          return (
                            <div
                              key={otId}
                              className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 group shadow-md ${
                                isBeingEdited
                                  ? 'bg-[#18233a] border-amber-400 ring-2 ring-amber-400/30'
                                  : 'bg-[#0f172a] hover:bg-[#162238] border-white/10 hover:border-amber-400/40'
                              }`}
                            >
                              <div className="flex items-center gap-3 min-w-0 flex-1">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-inner ${
                                  isBeingEdited ? 'bg-amber-400 text-black font-black' : 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                                }`}>
                                  <Tag size={18} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <p className="font-black text-white text-sm sm:text-base truncate">{otName}</p>
                                    {isBeingEdited && (
                                      <span className="text-[9px] bg-amber-400 text-black px-1.5 py-0.5 rounded font-black uppercase tracking-wider">
                                        Editing
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-black">
                                      {countForType} {countForType === 1 ? 'Order' : 'Orders'}
                                    </span>
                                    {orders.length > 0 && (
                                      <span className="text-[10px] text-slate-400 font-bold">
                                        • {sharePct}% share
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  title={`Edit "${otName}"`}
                                  onClick={() => {
                                    setEditOrderTypeId(otId);
                                    setNewOrderTypeName(otName);
                                  }}
                                  className="p-2 text-blue-400 hover:text-white hover:bg-blue-600/80 rounded-xl transition-colors cursor-pointer"
                                >
                                  <Pencil size={15} />
                                </button>

                                <button
                                  type="button"
                                  title={`Delete "${otName}"`}
                                  onClick={() => handleDeleteOrderType(ot)}
                                  className="p-2 text-rose-400 hover:text-white hover:bg-rose-600/80 rounded-xl transition-colors cursor-pointer"
                                >
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Right Panel Footer Status */}
                  <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] font-bold text-slate-400">
                    <span>Configured Types: <strong className="text-white">{orderTypes.length}</strong></span>
                    <span>Status: <strong className="text-emerald-400">Synced to Cloud</strong></span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL CLUSTER - ENSURE UNIQUE BLOCKS */}
      {/* (Removed duplicate isInvoiceOpen blocks) */}
      {isInvoiceOpen && selectedOrderForInvoice && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-300 overflow-y-auto"
          onClick={() => setIsInvoiceOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <OrderInvoiceView
              order={(() => {
                const invoicePriceData = calculatePriceInfo(
                  selectedOrderForInvoice.chocolate,
                  selectedOrderForInvoice.count,
                  selectedOrderForInvoice.discount,
                  selectedOrderForInvoice.isDeliveryFree,
                  selectedOrderForInvoice.paymentStatus,
                  selectedOrderForInvoice.category,
                  customPricesMap,
                  selectedOrderForInvoice.manualDeliveryFee,
                  selectedOrderForInvoice.orderStatus,
                  managedChocPricesMap,
                  selectedOrderForInvoice.pricingType,
                  selectedOrderForInvoice.manualProductPrice
                );
                return {
                  ...selectedOrderForInvoice,
                  totalPrice: invoicePriceData.fullTotalPrice,
                  totalOrderPrice: invoicePriceData.fullTotalPrice,
                  itemSubtotal: invoicePriceData.fullChocolatePrice,
                  calculatedDeliveryFee: invoicePriceData.fullDeliveryCharge
                };
              })()}
              onClose={() => setIsInvoiceOpen(false)}
            />
          </div>
        </div>
      )}

      {/* 🟢 PROFIT TABLE MODAL */}
      {isProfitModalOpen && (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-3 sm:p-4 backdrop-blur-md" onClick={() => setIsProfitModalOpen(false)}>
          <div style={{ backgroundColor: '#0c1427', color: '#ffffff' }} className="bg-[#0c1427] rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90dvh] flex flex-col overflow-hidden border border-white/20 text-white" onClick={(e) => e.stopPropagation()}>
            <div style={{ backgroundColor: '#131c2e' }} className="p-4 sm:p-6 bg-[#131c2e] border-b border-white/15 flex justify-between items-center shadow-md">
              <h2 className="text-xl sm:text-2xl font-black text-amber-400 uppercase tracking-widest flex items-center gap-2.5"><DollarSign className="text-amber-400" /> Profit Analytics Table</h2>
              <button onClick={() => setIsProfitModalOpen(false)} className="text-slate-300 hover:text-white p-1 rounded-full cursor-pointer transition-colors"><X size={24} /></button>
            </div>

            <div className="overflow-auto flex-1 px-2 sm:px-4 py-0 bg-[#090e1a] custom-scrollbar responsive-table-container">
              <table className="w-full text-left border-collapse">
                <thead style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] text-amber-400 shadow-md border-b-2 border-amber-500/30">
                  <tr className="text-xs uppercase tracking-wider text-amber-400">
                    <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black border-r border-white/10 shadow-sm">Date</th>
                    <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black border-r border-white/10 shadow-sm">Inv #</th>
                    <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black border-r border-white/10 shadow-sm">Name</th>
                    <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black border-r border-white/10 text-center shadow-sm">Items</th>
                    <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black border-r border-white/10 text-right shadow-sm">Revenue</th>
                    <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black border-r border-white/10 text-right shadow-sm">Cost</th>
                    <th style={{ backgroundColor: '#162035' }} className="sticky top-0 z-30 bg-[#162035] p-3.5 font-black text-right shadow-sm">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.filteredOrders.map((order: any, idx: number) => {
                    const priceInfo = calculatePriceInfo(order.chocolate, order.count, order.discount, order.isDeliveryFree, order.paymentStatus, order.category, customPricesMap, order.manualDeliveryFee, order.orderStatus, managedChocPricesMap, order.pricingType, order.manualProductPrice);

                    const costInfo = calculateOrderFinalCost(order, managedChocPricesMap, managedChocStickersMap, customPricesMap);
                    const profit = priceInfo.fullRevenue - costInfo.finalCost;

                    return (
                      <tr key={order.fireId} className={`border-b border-white/5 text-sm transition-colors ${idx % 2 === 0 ? 'bg-[#0f172a]' : 'bg-[#131c2e]'} hover:bg-[#18243b]`}>
                        <td className="p-3.5 text-xs font-extrabold text-slate-300 border-r border-white/5">{order.orderDate || order.functionDate}</td>
                        <td className="p-3.5 text-xs font-black text-amber-300 font-mono border-r border-white/5">{getSerial(order.id)}</td>
                        <td className="p-3.5 text-sm font-extrabold text-white border-r border-white/5 break-words min-w-[140px] max-w-[280px]" title={order.name}>{order.name}</td>
                        <td className="p-3.5 text-sm font-black text-center text-amber-300 font-mono border-r border-white/5">{order.count}</td>
                        <td className="p-3.5 text-sm font-mono font-black text-right text-emerald-300 border-r border-white/5">₹{priceInfo.fullRevenue.toLocaleString()}</td>
                        <td className="p-3.5 text-sm font-mono font-black text-right text-rose-400 border-r border-white/5">₹{Math.round(costInfo.finalCost).toLocaleString()}</td>
                        <td className={`p-3.5 text-sm font-mono font-black text-right ${profit >= 0 ? 'text-amber-300' : 'text-red-400'}`}>₹{Math.round(profit).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ backgroundColor: '#131c2e' }} className="p-6 bg-[#131c2e] border-t border-white/15 grid grid-cols-1 sm:grid-cols-3 gap-4 shadow-2xl">
              <div className="bg-[#090e1a] p-4 rounded-2xl border border-emerald-500/30 text-center shadow-md">
                <p className="text-xs font-extrabold text-emerald-400 uppercase tracking-wider">Total Revenue</p>
                <p className="text-2xl font-black text-emerald-300 font-mono mt-1 drop-shadow-[0_0_10px_rgba(16,185,129,0.4)]">₹{Math.round(reportData.totalRev).toLocaleString()}</p>
              </div>
              <div className="bg-[#090e1a] p-4 rounded-2xl border border-red-500/30 text-center shadow-md">
                <p className="text-xs font-extrabold text-red-400 uppercase tracking-wider">Total Cost</p>
                <p className="text-2xl font-black text-red-400 font-mono mt-1 drop-shadow-[0_0_10px_rgba(239,68,68,0.4)]">₹{Math.round(reportData.totalCost).toLocaleString()}</p>
              </div>
              <div className="bg-[#090e1a] p-4 rounded-2xl border border-amber-500/30 text-center shadow-md">
                <p className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">Net Profit</p>
                <p className="text-2xl font-black text-amber-300 font-mono mt-1 drop-shadow-[0_0_10px_rgba(245,158,11,0.4)]">₹{Math.round(reportData.totalProfit).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🟢 NEW: WHATSAPP MESSAGE EDITOR MODAL */}
      {isWhatsAppModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setIsWhatsAppModalOpen(false)}>
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg border-2 border-[#d7ccc8] overflow-hidden transform transition-all" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-br from-green-600 to-green-700 p-6 text-center relative border-b-4 border-green-800">
              <button type="button" onClick={() => setIsWhatsAppModalOpen(false)} className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"><X size={20} /></button>
              <div className="w-16 h-16 bg-white rounded-full mx-auto flex items-center justify-center shadow-inner mb-3 text-green-600">
                <MessageCircle size={32} strokeWidth={2.5} />
              </div>
              <h2 className="text-2xl font-black text-white tracking-wide">WhatsApp Share</h2>
              <p className="text-green-100/80 text-xs font-bold mt-1 tracking-widest uppercase">Edit message before sharing</p>
            </div>

            <div className="p-7 space-y-5">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-black text-gray-500 uppercase tracking-wider">Message Content</label>
                  <button
                    onClick={() => {
                      if (whatsAppOrder) {
                        setWhatsAppMessage(generateWhatsAppMessage(whatsAppOrder));
                      }
                    }}
                    className="text-[10px] font-black text-green-600 bg-green-50 px-2 py-1 rounded-lg border border-green-200 hover:bg-green-100 transition-colors uppercase tracking-widest"
                  >
                    Auto-Fill Details
                  </button>
                </div>

                <textarea
                  value={whatsAppMessage}
                  onChange={(e) => setWhatsAppMessage(e.target.value)}
                  className="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl outline-none focus:border-green-500 font-medium text-gray-800 transition-colors shadow-inner resize-none h-48"
                  placeholder="Enter message..."
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setIsWhatsAppModalOpen(false)} className="flex-1 py-3 bg-white border-2 border-gray-100 text-gray-500 rounded-xl font-black uppercase tracking-widest hover:bg-gray-50 transition-all">
                  Cancel
                </button>
                <button
                  onClick={handleWhatsAppShare}
                  className="flex-1 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl font-black uppercase tracking-widest shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                >
                  <Share2 size={18} /> Share
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Monthly Winner Picker Modal */}
      {isWinnerPickerModalOpen && (
        <div
          onClick={() => setIsWinnerPickerModalOpen(false)}
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300 cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-transparent max-w-sm w-full animate-in fade-in zoom-in-95 slide-in-from-bottom-8 ease-out duration-300 cursor-default"
          >
            <MonthlyWinnerPicker orders={orders} onClose={() => setIsWinnerPickerModalOpen(false)} />
          </div>
        </div>
      )}

      {/* 🟣 ORDER DETAILS & ACTIVITY TIMELINE MODAL */}
      {historyDetailOrder && (
        <div
          className="fixed inset-0 bg-black/70 z-[210] flex items-center justify-center p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={() => setHistoryDetailOrder(null)}
        >
          <div
            className="bg-[#fffcf9] rounded-[2rem] shadow-2xl w-full max-w-4xl max-h-[90dvh] overflow-hidden border border-amber-100 flex flex-col transform transition-all animate-in zoom-in-95 ease-out duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-950 to-amber-900 p-4 sm:p-6 text-white flex justify-between items-center border-b-4 border-amber-800 shrink-0">
              <div>
                <h2 className="text-lg sm:text-xl font-black tracking-wide flex items-center gap-2">
                  <History size={20} className="text-amber-400" />
                  Order Detail & History
                </h2>
                <p className="text-amber-200/80 text-xs font-bold mt-1 tracking-widest uppercase">
                  {historyDetailOrder.isFallback ? 'Fallback Record' : `Invoice: ${getSerial(historyDetailOrder.id)}`}
                  {historyDetailOrder.isFromTrash && <span className="ml-2 text-red-300 bg-red-950/40 border border-red-500/35 px-2 py-0.5 rounded text-[10px]">In Trash Bin</span>}
                </p>
              </div>
              <button
                onClick={() => setHistoryDetailOrder(null)}
                className="text-amber-100 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 custom-scrollbar">

              {/* Left Column: Order details Card */}
              <div className="space-y-4">
                <h3 className="text-xs font-black text-amber-900 uppercase tracking-widest border-b border-amber-100 pb-2">Customer & Item Information</h3>

                <div className="bg-white border-2 border-amber-50 rounded-2xl p-5 space-y-3.5 shadow-sm">
                  <div>
                    <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block">Customer Name</span>
                    <span className="text-base font-black text-amber-950">{historyDetailOrder.name}</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block">Contact Number</span>
                    <span className="text-sm font-black text-amber-900">{formatPhoneNumber(historyDetailOrder.phone) || 'N/A'}</span>
                  </div>

                  {historyDetailOrder.address && (
                    <div>
                      <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block">Delivery Address</span>
                      <span className="text-xs font-bold text-slate-700">{historyDetailOrder.address}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-amber-50">
                    <div>
                      <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block">Category</span>
                      <span className="text-xs font-black uppercase text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/50 w-max block mt-0.5">
                        {historyDetailOrder.category || 'chocolate'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block">Order Type</span>
                      <span className="text-xs font-black uppercase text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/50 w-max block mt-0.5">
                        {historyDetailOrder.orderType || 'Sabi'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-amber-50">
                    <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block">{historyDetailOrder.category === 'product' ? 'Product Name' : 'Chocolate Name'}</span>
                    <span className="text-sm font-black text-amber-950 block mt-0.5">{historyDetailOrder.chocolate || historyDetailOrder.productName || 'N/A'}</span>
                    <span className="text-xs text-slate-500 font-semibold mt-1 block">Quantity: <strong className="text-amber-950">{historyDetailOrder.count}</strong> units</span>
                  </div>
                </div>

                <div className="bg-white border-2 border-amber-50 rounded-2xl p-5 space-y-3 shadow-sm">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <span className="text-[9px] text-amber-600 font-bold uppercase tracking-wider block">Subtotal</span>
                      <span className="text-xs font-extrabold text-slate-700">₹{(historyDetailOrder.itemSubtotal || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-amber-600 font-bold uppercase tracking-wider block">Discount</span>
                      <span className="text-xs font-extrabold text-red-600">-₹{(historyDetailOrder.discount || 0).toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-amber-600 font-bold uppercase tracking-wider block">Delivery Fee</span>
                      <span className="text-xs font-extrabold text-slate-700">
                        {historyDetailOrder.isDeliveryFree ? 'Free' : `₹${(historyDetailOrder.calculatedDeliveryFee || 0).toLocaleString()}`}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-3 border-t border-amber-50">
                    <div>
                      <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block">Total Price</span>
                      <span className="text-base font-black text-green-700">₹{(historyDetailOrder.totalOrderPrice || 0).toLocaleString()}</span>
                    </div>
                    {Number(historyDetailOrder.advanceAmount) > 0 && (
                      <div className="text-right">
                        <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider block">Advance Paid</span>
                        <span className="text-xs font-black text-blue-600">₹{Number(historyDetailOrder.advanceAmount).toLocaleString()}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-amber-50">
                    <div>
                      <span className="text-[9px] text-amber-600 font-bold uppercase tracking-wider block">Payment Status</span>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider mt-1 ${historyDetailOrder.paymentStatus === 'Full Paid' ? 'bg-green-50 text-green-700 border-green-200' :
                        historyDetailOrder.paymentStatus === 'Partially Paid' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          'bg-red-50 text-red-700 border-red-200'
                        }`}>
                        {historyDetailOrder.paymentStatus || 'Pending'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[9px] text-amber-600 font-bold uppercase tracking-wider block">Dispatch Status</span>
                      <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black border uppercase tracking-wider mt-1 ${historyDetailOrder.status === 'Delivered' ? 'bg-green-50 text-green-700 border-green-200' :
                        'bg-yellow-50 text-yellow-700 border-yellow-200'
                        }`}>
                        {historyDetailOrder.status || 'In Process'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Timeline stepper */}
              <div className="space-y-4">
                <h3 className="text-xs font-black text-amber-900 uppercase tracking-widest border-b border-amber-100 pb-2">Activity History Timeline</h3>

                <div className="max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
                  {relatedLogs.length === 0 ? (
                    <div className="text-center py-16 text-slate-400 font-bold text-xs bg-white rounded-2xl border-2 border-amber-50/50 p-6">
                      <History size={36} className="mx-auto mb-2 opacity-35 text-slate-400" />
                      No log history found for this order.
                    </div>
                  ) : (
                    <div className="relative pl-6 border-l border-amber-200/70 space-y-5 py-2">
                      {relatedLogs.map((log: any, idx: number) => {
                        const actionLower = (log.action || '').toLowerCase();
                        const isAdd = actionLower.startsWith('added') || actionLower.startsWith('registered');
                        const isEdit = actionLower.startsWith('edited');
                        const isDelete = actionLower.startsWith('deleted') || actionLower.startsWith('permanently');
                        const isRestore = actionLower.startsWith('restored');
                        const dotColor = isAdd ? 'bg-emerald-500 ring-emerald-100' : isEdit ? 'bg-amber-500 ring-amber-100' : isDelete ? 'bg-red-500 ring-red-100' : isRestore ? 'bg-blue-500 ring-blue-100' : 'bg-slate-400 ring-slate-100';

                        return (
                          <div key={log.fireId || idx} className="relative group/timeline">
                            {/* Dot */}
                            <span className={`absolute -left-[30px] top-1 w-3 h-3 rounded-full ring-4 ${dotColor} border border-white`} />

                            <div className="bg-white border border-amber-100/50 rounded-xl p-3 shadow-[0_2px_4px_rgba(0,0,0,0.02)] hover:shadow-md transition-shadow">
                              <p className="text-xs font-bold text-slate-800 leading-normal">{log.action}</p>
                              <div className="flex justify-between items-center text-[9px] text-slate-400 font-semibold mt-2 border-t border-slate-50 pt-1.5">
                                <span className="flex items-center gap-1">
                                  <User size={8} /> By: {log.performedBy || 'System'} ({log.role || 'Admin'})
                                </span>
                                <span>
                                  {new Date(log.timestamp).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-amber-50/50 border-t border-amber-100 flex justify-end shrink-0">
              <button
                onClick={() => setHistoryDetailOrder(null)}
                className="px-6 py-2 rounded-xl font-bold text-xs text-amber-900 bg-white border-2 border-amber-200 hover:bg-amber-50 shadow-sm transition-all active:scale-95 cursor-pointer"
              >
                Close details
              </button>
            </div>
          </div>
        </div>
      )}


      {/* === IMAGE GALLERY MODAL === */}
      {isImageGalleryOpen && imageGalleryProduct && (() => {
        const images = imageGalleryProduct.images || [];
        const currentImage = images[galleryActiveIndex];
        return (
          <div
            className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-3 backdrop-blur-xl"
            onClick={() => { setIsImageGalleryOpen(false); setDeleteImageConfirm(null); }}
          >
            <div
              className="bg-[#0b1329] rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90dvh] overflow-hidden border border-white/15 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 shrink-0">
                <h3 className="text-sm font-black text-white uppercase tracking-wider">{imageGalleryProduct.name} — Images ({images.length})</h3>
                <button onClick={() => { setIsImageGalleryOpen(false); setDeleteImageConfirm(null); }} className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors cursor-pointer"><X size={18} /></button>
              </div>

              {images.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-10 text-center">
                  <ImageIcon size={48} className="text-slate-600 mb-3" />
                  <p className="text-slate-400 font-bold text-sm">No images added yet.</p>
                  <label className="mt-4 px-5 py-2.5 bg-amber-500 text-black font-black text-xs rounded-xl cursor-pointer hover:bg-amber-400 transition-colors">
                    + Add Images
                    <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" multiple className="hidden" onChange={(e) => { if (e.target.files) handleImageUpload(imageGalleryProduct.fireId, e.target.files); e.target.value = ''; }} />
                  </label>
                </div>
              ) : (
                <>
                  {/* Main Image Display with Overlay Buttons */}
                  <div className="relative flex items-center justify-center bg-black/40 shrink-0" style={{ height: 'clamp(200px, 45vh, 420px)' }}>
                    {currentImage && (
                      <img
                        id="gallery-main-image"
                        crossOrigin="anonymous"
                        src={currentImage}
                        alt={`Product ${galleryActiveIndex + 1}`}
                        className="max-w-full max-h-full object-contain p-3"
                      />
                    )}

                    {/* Nav Arrows */}
                    {images.length > 1 && (
                      <>
                        <button
                          onClick={() => setGalleryActiveIndex(prev => prev === 0 ? images.length - 1 : prev - 1)}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-full transition-colors cursor-pointer shadow-lg"
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <button
                          onClick={() => setGalleryActiveIndex(prev => prev === images.length - 1 ? 0 : prev + 1)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2.5 rounded-full transition-colors cursor-pointer shadow-lg"
                        >
                          <ChevronRight size={20} />
                        </button>
                      </>
                    )}
                    <span className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-[10px] font-bold px-3 py-1 rounded-full">{galleryActiveIndex + 1} / {images.length}</span>
                  </div>

                  {/* Thumbnails */}
                  {images.length > 1 && (
                    <div className="px-4 py-2.5 border-t border-white/10 shrink-0">
                      <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
                        {images.map((img: string, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => setGalleryActiveIndex(idx)}
                            className={`shrink-0 w-12 h-12 rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${idx === galleryActiveIndex ? 'border-amber-400 shadow-lg shadow-amber-400/30 scale-110' : 'border-white/10 hover:border-white/30 opacity-60 hover:opacity-100'}`}
                          >
                            <img src={img} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bottom Action Bar - always visible */}
                  <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between shrink-0 gap-3 bg-[#0a1020]">
                    <label className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-black text-xs rounded-xl cursor-pointer transition-all hover:scale-105 active:scale-95 border border-amber-500/20">
                      <Upload size={14} /> Add More Images
                      <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" multiple className="hidden" onChange={(e) => { if (e.target.files) handleImageUpload(imageGalleryProduct.fireId, e.target.files); e.target.value = ''; }} />
                    </label>
                    <div className="flex gap-2">
                      <button
                        onClick={() => currentImage && handleCopyImage(currentImage)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs rounded-xl shadow-lg shadow-blue-900/40 transition-all cursor-pointer hover:scale-105 active:scale-95"
                      >
                        <ClipboardList size={14} /> Copy Image
                      </button>
                      <button
                        onClick={() => handleDeleteImage(imageGalleryProduct.fireId, galleryActiveIndex)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg shadow-rose-900/40 transition-all cursor-pointer hover:scale-105 active:scale-95"
                      >
                        <Trash2 size={14} /> Delete
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}



    </div>
  );
}


