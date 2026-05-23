window.BusPassConfig = {
  branding: {
    appName: "Digital Bus Pass",
    logoUrl: "tcs_black_new.png"
  },

  // hardcoded in the eTMS APK at res/values/strings.xml
  qrCrypto: {
    key: "YourEncryptionKe",
    iv:  "YourEncryptionKe"
  },

  drawer: [
    { key: "home",      label: "Home",                   route: "#/home",      icon: "navHome" },
    { key: "viewpass",  label: "View Bus Pass",          route: "#/view-pass", icon: "navApplyBus" },
    { key: "apply",     label: "Apply Bus Pass",         route: "#/apply",     icon: "navApplyBus" },
    { key: "status",    label: "Buspass Request Status", route: "#/upcoming",  icon: "navRequestStatus" },
    { key: "history",   label: "Bus Pass History",       route: "#/history",   icon: "navHistory" },
    { key: "renew",     label: "Renew Bus Pass",         route: "#/renew",     icon: "navHistory" },
    { key: "scan",      label: "Scan QR",                route: "#/scan",      icon: "navScan" },
    { key: "settings",  label: "Settings",               route: "#/settings",  icon: "navSettings" },
    { key: "logout",    label: "Logout",                 route: "#/logout",    icon: "navLogout" }
  ],

  homeTiles: [
    { key: "buspass", label: "Bus Services",     route: "#/view-pass", icon: "tileBuspass", active: true  },
    { key: "scan",    label: "Scan QR",          route: "#/scan",      icon: "tileScan",    active: true  },
    { key: "cab",     label: "Cab Services",     route: "",            icon: "tileCab",     active: false },
    { key: "geocode", label: "Geocode Yourself", route: "",            icon: "tileGeocode", active: false }
  ],

  employee: {
    name: "BAISHAKHI BORAL",
    empCode: "2785346",
    empId: "9458314"
  },

  // current active bus pass (the one shown on View Bus Pass)
  currentPass: {
    requestId: 2823132,
    busManagementId: 7775,
    routeId: "2809",
    busPassType: "C",            // C = Confirmed
    tripType: "B",               // B = Both
    pickTiming: "10:00",
    dropTiming: "19:30",
    from: "Dakshineswar",
    to: "Ecospace IT",
    busStopName: "Dakshineswar",
    routeName: "Dakshineswar To Gitanjali Park And Return Via-Airport",
    startDate: "1st May, 2026",
    endDate:   "31st May, 2026",
    routeTypeLabel: "Both",
    busNumber: null,
    seatNumber: null
  },

  upcoming: [
    {
      requestId: 2823132, status: "Confirmed",
      facility: "Ecospace IT", busStop: "Dakshineswar",
      pickTime: "10:00", dropTime: "19:30",
      startDate: "01-May-2026", endDate: "31-May-2026",
      tripType: "Both", canEdit: true, canCancel: true
    },
    {
      requestId: 2823999, status: "Waiting",
      facility: "Ecospace IT", busStop: "Dakshineswar",
      pickTime: "10:00", dropTime: "19:30",
      startDate: "01-Jun-2026", endDate: "30-Jun-2026",
      tripType: "Both", canEdit: true, canCancel: true
    }
  ],

  history: [
    {
      requestId: 2811200, status: "Confirmed",
      facility: "Ecospace IT", busStop: "Dakshineswar",
      pickTime: "10:00", dropTime: "19:30",
      startDate: "01-Apr-2026", endDate: "30-Apr-2026",
      tripType: "Both"
    },
    {
      requestId: 2799880, status: "Confirmed",
      facility: "Ecospace IT", busStop: "Dakshineswar",
      pickTime: "10:00", dropTime: "19:30",
      startDate: "01-Mar-2026", endDate: "31-Mar-2026",
      tripType: "Both"
    },
    {
      requestId: 2788123, status: "Cancelled",
      facility: "Ecospace IT", busStop: "Dakshineswar",
      pickTime: "10:00", dropTime: "19:30",
      startDate: "01-Feb-2026", endDate: "28-Feb-2026",
      tripType: "Pickup"
    }
  ],

  renewMonths: [
    { label: "Jun 2026", date: "01-Jun-2026 to 30-Jun-2026", charges: "₹ 1500" },
    { label: "Jul 2026", date: "01-Jul-2026 to 31-Jul-2026", charges: "₹ 1500" },
    { label: "Aug 2026", date: "01-Aug-2026 to 31-Aug-2026", charges: "₹ 1500" }
  ],

  cancelReasons: [
    "Work From Home",
    "Personal Leave",
    "Sick Leave",
    "Route Changed",
    "No Longer Needed",
    "Others"
  ],

  copy: {
    cancelPolicy: "Confirmed buspass can be cancelled only within 48 hrs of booking.",
    waitlistInstr: "You will be notified once the bus pass is confirmed.",
    noUpcoming: "Upcoming Bus Pass doesn't exist.",
    noHistory: "Bus Pass History doesn't exist.",
    modifyPrompt: "Need to modify bus pass?"
  }
};
