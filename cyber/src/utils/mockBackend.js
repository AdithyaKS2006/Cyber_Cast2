import supabase from './supabaseClient';

/**
 * Mock & Supabase Data Provider for CrimeCast.
 * Fetches real data from Supabase DB tables (e.g. complaints) when available,
 * falling back seamlessly to structured mock data if Supabase connection fails.
 */

let cachedComplaints = null;
let lastFetchTime = 0;

function mapSupabaseRowToComplaint(row, idx) {
  const amount = Number(row.fraud_amount || row.amount_lost || row.amount || 150000);
  const createdDate = row.created_at || row.complaint_timestamp || new Date().toISOString();

  const state = row.victim_state || row.state || 'Karnataka';
  const district = row.victim_district || row.district || 'Bengaluru Urban';
  const suspectBank = row.suspect_bank || 'HDFC Bank';
  const suspectAcc = row.suspect_account_number || row.suspect_account || '918237465012';
  const victimName = row.victim_name || row.complainant_name || row.name || 'Complainant';
  const victimPhone = row.victim_phone || row.complainant_phone || row.phone || '+91 98450 12345';

  const categoryMap = {
    'UPI': 'UPI Fraud',
    'EMAIL_PHISHING': 'Phishing / Malware',
    'PHONE_CALL': 'Vishing / Impersonation',
    'NET_BANKING': 'Net Banking Fraud',
  };
  const category = categoryMap[row.fraud_method] || row.fraud_method || row.category || 'UPI Fraud';
  const narrative = row.narrative_text || row.narrative || row.description || 'Phishing QR Code / Remote Access Screen Share';

  const elapsedMins = Math.floor((Date.now() - new Date(createdDate).getTime()) / 60000);
  const goldenWindow = Math.max(0, 60 - Math.max(0, elapsedMins % 90));

  const freezeStatusMap = {
    'CLOSED': 'FROZEN_FULL',
    'PREDICTION_ACTIVE': 'PENDING_NODAL',
    'INTERCEPTED': 'FROZEN_FULL',
  };
  const freezeStatus = freezeStatusMap[row.status] || (row.priority === 'CRITICAL' ? 'PENDING_NODAL' : 'INITIATED');

  const compNum = row.complaint_number || row.id || `CMP-2026-${8840 + idx}`;
  const ackNum = row.acknowledgement_number || (row.complaint_number ? (row.complaint_number.startsWith('NCRP') ? row.complaint_number : `NCRP-2026-IN-${row.complaint_number.replace(/[^0-9]/g, '') || idx}`) : `NCRP-2026-IN-${98214 + idx}`);

  return {
    id: compNum,
    complaint_number: compNum,
    acknowledgement_number: ackNum,
    category: category,
    fraud_method: category,
    sub_category: narrative.length > 60 ? narrative.substring(0, 60) + '...' : narrative,
    amount_lost: amount,
    fraud_amount: amount,
    priority: row.priority || (amount > 500000 ? 'CRITICAL' : 'HIGH'),
    status: row.status || 'PREDICTION_ACTIVE',
    incident_date: row.fraud_timestamp || row.incident_date || createdDate,
    fraud_timestamp: row.fraud_timestamp || row.incident_date || createdDate,
    created_at: createdDate,
    complaint_timestamp: createdDate,
    state: state,
    victim_state: state,
    district: district,
    victim_district: district,
    suspect_account: suspectAcc,
    suspect_bank: suspectBank,
    complainant_name: victimName,
    victim_name: victimName,
    complainant_phone: victimPhone,
    victim_phone: victimPhone,
    narrative_text: narrative,
    golden_window_remaining_mins: goldenWindow,
    chain_hops_detected: (idx % 5) + 3,
    freeze_status: freezeStatus,
    transaction_hops: row.transaction_hops || [
      { from_bank: 'Victim Primary Account', from_account: victimPhone.replace(/[^0-9]/g, '').slice(-4) || '9845', amount: amount, is_mule_flagged: false },
      { from_bank: suspectBank, from_account: suspectAcc, amount: amount, is_mule_flagged: true }
    ]
  };
}

export async function fetchLiveComplaints() {
  const now = Date.now();
  if (cachedComplaints && (now - lastFetchTime < 5000)) {
    return cachedComplaints;
  }
  try {
    const { data, error } = await supabase
      .from('complaints')
      .select('*')
      .order('created_at', { ascending: false });

    if (error || !data || data.length === 0) {
      return MOCK_COMPLAINTS;
    }

    const mapped = data.map((row, idx) => mapSupabaseRowToComplaint(row, idx));
    const merged = [...MOCK_COMPLAINTS.filter(mc => mc.isLocalCreated), ...mapped];
    cachedComplaints = merged;
    lastFetchTime = now;
    return merged;
  } catch (err) {
    console.warn('[mockBackend] Supabase fetch exception:', err);
    return MOCK_COMPLAINTS;
  }
}

export async function getLiveStats() {
  const complaints = await fetchLiveComplaints();
  const dbAmount = complaints.reduce((acc, c) => acc + (Number(c.amount_lost) || 0), 0);
  const totalIntercepted = 5670000000 + Math.floor(dbAmount * 0.85);
  const cr = (totalIntercepted / 10000000).toFixed(0);

  const activePreds = complaints.filter(c => c.status === 'PREDICTION_ACTIVE' || c.priority === 'CRITICAL').length || MOCK_DASHBOARD_STATS.active_predictions;

  const trendCounts = [14, 22, 19, 31, 28, 35, 42, 38, 49, 54, 48, 62, 58, 71, complaints.length];

  return {
    ...MOCK_DASHBOARD_STATS,
    total_complaints: complaints.length > MOCK_DASHBOARD_STATS.total_complaints ? complaints.length : (MOCK_DASHBOARD_STATS.total_complaints + complaints.length),
    active_predictions: activePreds,
    intercepted_amount: totalIntercepted,
    intercepted_formatted: `₹ ${cr} Cr`,
    fraud_trend: trendCounts,
    trend_30d: trendCounts,
  };
}

export async function getLivePredictions() {
  const complaints = await fetchLiveComplaints();
  const activeList = complaints.filter(c => c.status === 'PREDICTION_ACTIVE' || c.priority === 'CRITICAL').slice(0, 10);
  const sourceList = activeList.length ? activeList : MOCK_COMPLAINTS;

  const districtCoords = {
    'Bengaluru': { lat: 12.9716, lon: 77.5946 },
    'Bengaluru Urban': { lat: 12.9716, lon: 77.5946 },
    'Mumbai': { lat: 19.0760, lon: 72.8777 },
    'Mumbai Suburban': { lat: 19.0760, lon: 72.8777 },
    'Pune': { lat: 18.5204, lon: 73.8567 },
    'New Delhi': { lat: 28.6139, lon: 77.2090 },
    'Delhi': { lat: 28.6139, lon: 77.2090 },
    'Jaipur': { lat: 26.9124, lon: 75.7873 },
    'Agra': { lat: 27.1767, lon: 78.0081 },
    'Warangal': { lat: 17.9689, lon: 79.5941 },
    'Hyderabad': { lat: 17.3850, lon: 78.4867 },
    'Gurugram': { lat: 28.4595, lon: 77.0266 },
  };

  return sourceList.map((c, i) => {
    const coords = districtCoords[c.district] || districtCoords[c.state] || { lat: 12.9716 + (i * 0.4), lon: 77.5946 + (i * 0.3) };
    const amount = Number(c.amount_lost || c.fraud_amount || 485000);
    const windowMins = c.golden_window_remaining_mins || (18 + (i * 8));
    const eta = Number((windowMins / 60).toFixed(1));
    const zone = `${c.district || 'City'} ATM & Micro-ATM Hotspot #${i + 1}`;
    const prob = Number((0.88 - (i * 0.04)).toFixed(2));
    const ack = c.acknowledgement_number || c.complaint_number || `NCRP-2026-IN-${98214 + i}`;

    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pacs.008.001.08">
  <FIToFICstmrCdtTrf>
    <GrpHdr>
      <MsgId>I4C-INTERCEPT-${Date.now()}-${i}</MsgId>
      <CreDtTm>${new Date().toISOString()}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <SttlmInf><SttlmMtd>CLRG</SttlmMtd></SttlmInf>
    </GrpHdr>
    <CdtTrfTxInf>
      <PmtId><EndToEndId>${ack}</EndToEndId></PmtId>
      <IntrBkSttlmAmt Ccy="INR">${amount}</IntrBkSttlmAmt>
      <Dbtr><Nm>${c.complainant_name || c.victim_name || 'Victim'}</Nm></Dbtr>
      <Cdtr><Nm>${c.suspect_account || 'Mule Target'}</Nm></Cdtr>
      <CdtrAgt><FinInstnId><BICFI>${c.suspect_bank || 'HDFC Bank'}</BICFI></FinInstnId></CdtrAgt>
    </CdtTrfTxInf>
  </FIToFICstmrCdtTrf>
</Document>`;

    return {
      id: `PRED-2026-${String(i + 1).padStart(3, '0')}`,
      complaint_ack: ack,
      acknowledgement_number: ack,
      complaint: c.id,
      complaint_number: c.id,
      lat: coords.lat,
      lon: coords.lon,
      predicted_lat: coords.lat,
      predicted_lon: coords.lon,
      district: c.district,
      state: c.state,
      victim_district: c.district,
      victim_state: c.state,
      risk_score: prob,
      probability: prob,
      confidence: c.priority === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
      time_window_mins: windowMins,
      eta_hours: eta,
      predicted_cashout_zone: zone,
      predicted_zone_name: zone,
      outcome: c.status === 'CLOSED' || c.status === 'INTERCEPTED' ? 'INTERCEPTED' : (i % 3 === 0 ? 'NEEDS_REVIEW' : 'PENDING'),
      status: 'SENT',
      suspect_bank: c.suspect_bank || 'HDFC Bank',
      amount: amount,
      fraud_amount: amount,
      amount_lost: amount,
      mule_account: `${(c.suspect_account || '918237465012').substring(0, 6)}... (${c.suspect_bank || 'Bank'})`,
      iso20022_xml: sampleXml,
      iso20022_payload: sampleXml,
      top_features: [
        { name: 'Velocity of transfer', contribution: '+0.34' },
        { name: 'ATM night withdrawal pattern', contribution: '+0.28' },
        { name: 'New UPI device registration', contribution: '+0.21' },
      ],
      complaint_summary: {
        complaint_number: ack,
        fraud_amount: amount,
        victim_district: c.district,
        victim_state: c.state,
        category: c.category || 'UPI Fraud',
      }
    };
  });
}


const DEMO_OFFICERS = [
  {
    id: 1,
    role: 'Analyst',
    badge: '👮 Insp. Singh',
    rank: 'Field Officer',
    username: 'inspector_singh',
    name: 'Insp. Singh',
    email: 'inspector.singh@crimecast.gov.in',
    agency: 'Cyber Crime Investigation Division (I4C)',
  },
  {
    id: 2,
    role: 'Validator',
    badge: '⚖️ DSP Sharma',
    rank: 'Station Head',
    username: 'dsp_sharma',
    name: 'DSP Sharma',
    email: 'dsp.sharma@crimecast.gov.in',
    agency: 'Cyber Crime Investigation Division (I4C)',
  },
  {
    id: 3,
    role: 'Admin',
    badge: '👑 Admin Lead',
    rank: 'Nodal Admin',
    username: 'admin_crimecast',
    name: 'Admin Lead',
    email: 'admin@crimecast.gov.in',
    agency: 'National Cybercrime Reporting Portal (NCRP)',
  },
];

export const MOCK_COMPLAINTS = [
  {
    id: 'CMP-2026-8841',
    acknowledgement_number: 'NCRP-2026-IN-98214',
    category: 'UPI Fraud',
    sub_category: 'Phishing QR Code / Remote Access Screen Share',
    amount_lost: 485000,
    priority: 'CRITICAL',
    status: 'PREDICTION_ACTIVE',
    incident_date: new Date(Date.now() - 35 * 60000).toISOString(),
    created_at: new Date(Date.now() - 25 * 60000).toISOString(),
    state: 'Karnataka',
    district: 'Bengaluru Urban',
    suspect_account: '918237465012',
    suspect_bank: 'HDFC Bank',
    complainant_name: 'Dr. Rajesh Sundaram',
    complainant_phone: '+91 98450 12345',
    golden_window_remaining_mins: 18,
    chain_hops_detected: 4,
    freeze_status: 'PENDING_NODAL',
  },
  {
    id: 'CMP-2026-8842',
    acknowledgement_number: 'NCRP-2026-IN-98215',
    category: 'Investment Fraud',
    sub_category: 'Fake Stock Trading App (Task Scam)',
    amount_lost: 1850000,
    priority: 'CRITICAL',
    status: 'UNDER_ANALYSIS',
    incident_date: new Date(Date.now() - 65 * 60000).toISOString(),
    created_at: new Date(Date.now() - 40 * 60000).toISOString(),
    state: 'Maharashtra',
    district: 'Mumbai Suburban',
    suspect_account: '348201948511',
    suspect_bank: 'ICICI Bank',
    complainant_name: 'Meera Deshmukh',
    complainant_phone: '+91 98200 54321',
    golden_window_remaining_mins: 34,
    chain_hops_detected: 6,
    freeze_status: 'FROZEN_PARTIAL',
  },
  {
    id: 'CMP-2026-8843',
    acknowledgement_number: 'NCRP-2026-IN-98216',
    category: 'Digital Arrest Scam',
    sub_category: 'CBI / ED Impersonation Video Call',
    amount_lost: 3200000,
    priority: 'CRITICAL',
    status: 'INTERCEPTED',
    incident_date: new Date(Date.now() - 110 * 60000).toISOString(),
    created_at: new Date(Date.now() - 85 * 60000).toISOString(),
    state: 'Delhi',
    district: 'New Delhi',
    suspect_account: '501004928371',
    suspect_bank: 'State Bank of India',
    complainant_name: 'Anand Verma',
    complainant_phone: '+91 98110 98765',
    golden_window_remaining_mins: 0,
    chain_hops_detected: 5,
    freeze_status: 'FROZEN_FULL',
  },
  {
    id: 'CMP-2026-8844',
    acknowledgement_number: 'NCRP-2026-IN-98217',
    category: 'SIM Swap / OTP',
    sub_category: 'eSIM Social Engineering Hijack',
    amount_lost: 240000,
    priority: 'HIGH',
    status: 'NEW',
    incident_date: new Date(Date.now() - 15 * 60000).toISOString(),
    created_at: new Date(Date.now() - 10 * 60000).toISOString(),
    state: 'Telangana',
    district: 'Hyderabad',
    suspect_account: '629104827361',
    suspect_bank: 'Axis Bank',
    complainant_name: 'Suresh Reddy',
    complainant_phone: '+91 98490 65432',
    golden_window_remaining_mins: 45,
    chain_hops_detected: 2,
    freeze_status: 'INITIATED',
  },
  {
    id: 'CMP-2026-8845',
    acknowledgement_number: 'NCRP-2026-IN-98218',
    category: 'Loan App Harassment',
    sub_category: 'Predatory Instant Loan Contact Harassment',
    amount_lost: 85000,
    priority: 'MEDIUM',
    status: 'UNDER_ANALYSIS',
    incident_date: new Date(Date.now() - 180 * 60000).toISOString(),
    created_at: new Date(Date.now() - 120 * 60000).toISOString(),
    state: 'Haryana',
    district: 'Gurugram',
    suspect_account: '192837465012',
    suspect_bank: 'Punjab National Bank',
    complainant_name: 'Pooja Bhatia',
    complainant_phone: '+91 99990 11223',
    golden_window_remaining_mins: 0,
    chain_hops_detected: 3,
    freeze_status: 'MONITORING',
  },
];

export const MOCK_PREDICTIONS = [
  {
    id: 'PRED-2026-001',
    complaint_ack: 'NCRP-2026-IN-98214',
    complaint: 1,
    lat: 12.9716,
    lon: 77.5946,
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    risk_score: 0.94,
    probability: 0.94,
    confidence: 'CRITICAL',
    time_window_mins: 22,
    predicted_cashout_zone: 'Koramangala 5th Block ATM Cluster',
    outcome: 'PENDING',
    suspect_bank: 'HDFC Bank',
    amount: 485000,
    mule_account: '562a4f9309f5... (HDFC)',
    top_features: [
      { name: 'Velocity of transfer', contribution: '+0.34' },
      { name: 'ATM night withdrawal pattern', contribution: '+0.28' },
      { name: 'New UPI device registration', contribution: '+0.21' },
    ],
  },
  {
    id: 'PRED-2026-002',
    complaint_ack: 'NCRP-2026-IN-98215',
    complaint: 2,
    lat: 19.0760,
    lon: 72.8777,
    district: 'Mumbai Suburban',
    state: 'Maharashtra',
    risk_score: 0.88,
    probability: 0.88,
    confidence: 'HIGH',
    time_window_mins: 41,
    predicted_cashout_zone: 'Andheri West Link Road Micro-ATM Hub',
    outcome: 'PENDING',
    suspect_bank: 'ICICI Bank',
    amount: 1850000,
    mule_account: '7953d77bed72... (ICICI)',
    top_features: [
      { name: 'Split multi-account dispersal', contribution: '+0.41' },
      { name: 'Crypto OTC desk linkage', contribution: '+0.25' },
    ],
  },
  {
    id: 'PRED-2026-003',
    complaint_ack: 'NCRP-2026-IN-98216',
    complaint: 3,
    lat: 28.6139,
    lon: 77.2090,
    district: 'New Delhi',
    state: 'Delhi',
    risk_score: 0.79,
    probability: 0.79,
    confidence: 'HIGH',
    time_window_mins: 15,
    predicted_cashout_zone: 'Connaught Place Outer Circle Bank Kiosk',
    outcome: 'INTERCEPTED',
    suspect_bank: 'State Bank of India',
    amount: 3200000,
    mule_account: '92a4de7b02f4... (SBI)',
    top_features: [
      { name: 'Rapid RTGS drain attempt', contribution: '+0.45' },
    ],
  },
  {
    id: 'PRED-2026-004',
    complaint_ack: 'NCRP-2026-IN-98217',
    complaint: 4,
    lat: 17.3850,
    lon: 78.4867,
    district: 'Hyderabad',
    state: 'Telangana',
    risk_score: 0.82,
    probability: 0.82,
    confidence: 'HIGH',
    time_window_mins: 34,
    predicted_cashout_zone: 'Hitec City Metro Station ATM',
    outcome: 'PENDING',
    suspect_bank: 'Axis Bank',
    amount: 240000,
    mule_account: '4ff1f6cdfe1a... (Axis)',
    top_features: [
      { name: 'Geographic anomaly between victim & ATM', contribution: '+0.38' },
    ],
  },
  {
    id: 'PRED-2026-005',
    complaint_ack: 'NCRP-2026-IN-98218',
    complaint: 5,
    lat: 28.4595,
    lon: 77.0266,
    district: 'Gurugram',
    state: 'Haryana',
    risk_score: 0.68,
    probability: 0.68,
    confidence: 'MEDIUM',
    time_window_mins: 55,
    predicted_cashout_zone: 'Cyber Hub Ground Level Dispenser',
    outcome: 'NEEDS_REVIEW',
    suspect_bank: 'Punjab National Bank',
    amount: 85000,
    mule_account: 'fbcff19bd268... (PNB)',
    top_features: [
      { name: 'High-frequency micro withdrawal', contribution: '+0.29' },
    ],
  },
];

export const MOCK_DASHBOARD_STATS = {
  total_complaints: 14280,
  active_predictions: 14,
  intercepted_amount: 5670000000,
  intercepted_formatted: '₹ 567 Cr',
  potential_recovery_rate: 89.2,
  average_window_minutes: 42.5,
  jurisdictions_engaged: 28,
  bank_nodes_integrated: 42,
  freeze_orders_issued: 320,
  active_syndicates_monitored: 8,
};

export const MOCK_FREEZE_QUEUE = [
  {
    id: 'FRZ-2026-101',
    freeze_id: 'FRZ-2026-101',
    complaint_id: 'CMP-2026-8841',
    complaint_number: 'NCRP-2026-IN-98214',
    account_number: '••••••••5012',
    target_account: '••••••••5012',
    account_holder: 'Aman Kumar (Mule #1)',
    bank_name: 'HDFC Bank',
    target_bank_name: 'HDFC Bank',
    ifsc: 'HDFC0000123',
    target_bank_ifsc: 'HDFC0000123',
    branch: 'Koramangala, Bengaluru',
    frozen_amount: 485000,
    freeze_amount: 485000,
    status: 'PENDING',
    created_at: new Date(Date.now() - 12 * 60000).toISOString(),
    requested_at: new Date(Date.now() - 12 * 60000).toISOString(),
    window_expires_at: new Date(Date.now() + 18 * 60000).toISOString(),
    legal_section: 'Section 106 BNSS 2023',
    nodal_officer: 'nodal.hdfc@bank.i4c.gov.in',
    i4c_freeze_id: 'I4C-FRZ-9921',
  },
  {
    id: 'FRZ-2026-102',
    freeze_id: 'FRZ-2026-102',
    complaint_id: 'CMP-2026-8842',
    complaint_number: 'NCRP-2026-IN-98215',
    account_number: '••••••••8511',
    target_account: '••••••••8511',
    account_holder: 'Vikram Joshi (Mule #2)',
    bank_name: 'ICICI Bank',
    target_bank_name: 'ICICI Bank',
    ifsc: 'ICIC0000456',
    target_bank_ifsc: 'ICIC0000456',
    branch: 'Andheri West, Mumbai',
    frozen_amount: 1850000,
    freeze_amount: 1850000,
    status: 'FROZEN',
    created_at: new Date(Date.now() - 28 * 60000).toISOString(),
    requested_at: new Date(Date.now() - 28 * 60000).toISOString(),
    window_expires_at: new Date(Date.now() + 32 * 60000).toISOString(),
    legal_section: 'Section 106 BNSS 2023',
    nodal_officer: 'nodal.icici@bank.i4c.gov.in',
    i4c_freeze_id: 'I4C-FRZ-9922',
  },
  {
    id: 'FRZ-2026-103',
    freeze_id: 'FRZ-2026-103',
    complaint_id: 'CMP-2026-8843',
    complaint_number: 'NCRP-2026-IN-98216',
    account_number: '••••••••8371',
    target_account: '••••••••8371',
    account_holder: 'Deepak Enterprise (Shell Entity)',
    bank_name: 'State Bank of India',
    target_bank_name: 'State Bank of India',
    ifsc: 'SBIN0000789',
    target_bank_ifsc: 'SBIN0000789',
    branch: 'Parliament Street, New Delhi',
    frozen_amount: 3200000,
    freeze_amount: 3200000,
    status: 'FROZEN',
    created_at: new Date(Date.now() - 45 * 60000).toISOString(),
    requested_at: new Date(Date.now() - 45 * 60000).toISOString(),
    window_expires_at: new Date(Date.now() + 5 * 60000).toISOString(),
    legal_section: 'Section 106 BNSS 2023',
    nodal_officer: 'nodal.sbi@bank.i4c.gov.in',
    i4c_freeze_id: 'I4C-FRZ-9923',
  },
];

export const MOCK_GRAPH_NETWORK = {
  nodes: [
    { id: 'VIC-1', label: 'Victim (Bengaluru)', node_type: 'VICTIM', bank_ifsc: 'HDFC0001234', account_hash: '9845012345', total_volume: 485000, amount: 485000 },
    { id: 'MULE-1', label: 'Mule 1 (HDFC)', node_type: 'SUSPECT_MULE', bank_ifsc: 'HDFC0005678', account_hash: '562a4f9309f5', freeze_status: 'INITIATED', total_volume: 485000, amount: 485000 },
    { id: 'MULE-2', label: 'Mule 2 (Axis)', node_type: 'CONFIRMED_MULE', bank_ifsc: 'UTIB0009876', account_hash: '7953d77bed72', freeze_status: 'FROZEN', total_volume: 300000, amount: 300000 },
    { id: 'MULE-3', label: 'Mule 3 (ICICI)', node_type: 'CONFIRMED_MULE', bank_ifsc: 'ICIC0003456', account_hash: '92a4de7b02f4', freeze_status: 'FROZEN', total_volume: 185000, amount: 185000 },
    { id: 'ATM-1', label: 'ATM #42 (Koramangala)', node_type: 'CASHOUT_ATM', bank_ifsc: 'ATM-KRM-042', account_hash: 'ATM42000011', freeze_status: 'MONITORED', total_volume: 185000, amount: 185000 },
    { id: 'SYND-1', label: 'Operation Garuda Syndicate', node_type: 'SYNDICATE_HUB', bank_ifsc: 'CRYPTO-USDT-HOT', account_hash: '0x8f92a10b4c', freeze_status: 'BLACK_LISTED', total_volume: 300000, amount: 300000 },
  ],
  edges: [
    { id: 'e1', source: 'VIC-1', target: 'MULE-1', amount: 485000, tx: 'UPI-TX-10928' },
    { id: 'e2', source: 'MULE-1', target: 'MULE-2', amount: 300000, tx: 'IMPS-TX-20918' },
    { id: 'e3', source: 'MULE-1', target: 'MULE-3', amount: 185000, tx: 'IMPS-TX-20919' },
    { id: 'e4', source: 'MULE-3', target: 'ATM-1', amount: 185000, tx: 'ATM-DISPATCH-PRED' },
    { id: 'e5', source: 'MULE-2', target: 'SYND-1', amount: 300000, tx: 'OTC-USDT' },
  ],
  links: [
    { source: 'VIC-1', target: 'MULE-1', amount: 485000, tx: 'UPI-TX-10928' },
    { source: 'MULE-1', target: 'MULE-2', amount: 300000, tx: 'IMPS-TX-20918' },
    { source: 'MULE-1', target: 'MULE-3', amount: 185000, tx: 'IMPS-TX-20919' },
    { source: 'MULE-3', target: 'ATM-1', amount: 185000, tx: 'ATM-DISPATCH-PRED' },
    { source: 'MULE-2', target: 'SYND-1', amount: 300000, tx: 'OTC-USDT' },
  ],
};

export const MOCK_EVIDENCE_LIST = [
  {
    id: 'EV-2026-001',
    complaint_number: 'NCRP-2026-IN-98214',
    title: 'ATM-HDFC-ALLD-04 Kiosk CCTV Stream Footage',
    evidence_type: 'CCTV_FOOTAGE',
    evidence_type_display: 'CCTV Kiosk Footage',
    description: 'Statutory Sec 91 CrPC direct video capture (02:15 AM - 02:45 AM). Captures suspect withdrawal.',
    sha256_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    atm_id: 'ATM-HDFC-ALLD-04',
    target_bank: 'HDFC Bank Ltd., Civil Lines Kiosk',
    atm_address: '12 Sardar Patel Marg, Civil Lines, Prayagraj',
    created_at: new Date(Date.now() - 120 * 60000).toISOString(),
    custody_logs: [
      { action: 'INITIAL_SEAL', timestamp: new Date(Date.now() - 120 * 60000).toISOString(), details: 'Automated SHA-256 seal assigned at ingestion.', performed_by: 'Insp. Singh', role: 'Field Officer', ip_address: '10.24.18.91' },
      { action: 'VERIFIED', timestamp: new Date(Date.now() - 30 * 60000).toISOString(), details: 'SHA-256 hash verified against master ledger.', performed_by: 'DSP Sharma', role: 'Station Head', ip_address: '10.24.18.102' }
    ]
  },
  {
    id: 'EV-2026-002',
    complaint_number: 'NCRP-2026-IN-98215',
    title: 'UPI Payment Receipt & Bank UTR Certificate',
    evidence_type: 'TRANSACTION_PROOF',
    evidence_type_display: 'Payment Proof',
    description: 'Victim ICICI netbanking transaction receipt with UTR 409817263910.',
    sha256_hash: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
    target_bank: 'ICICI Bank Ltd',
    created_at: new Date(Date.now() - 180 * 60000).toISOString(),
    custody_logs: [
      { action: 'INITIAL_SEAL', timestamp: new Date(Date.now() - 180 * 60000).toISOString(), details: 'Ingested via NCRP API gateway.', performed_by: 'NCRP Automated System', role: 'System Gateway', ip_address: '192.168.1.1' }
    ]
  }
];

/**
 * Handle incoming mock API requests in browser memory.
 */
export async function handleMockRequest(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const path = endpoint.split('?')[0].replace(/\/$/, '');

  // Helper response builder
  const jsonResponse = (data, status = 200) => {
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  // 1. Session check: /api/v1/users/me
  if (path.endsWith('/api/v1/users/me')) {
    const saved = localStorage.getItem('crimecast_demo_user');
    if (saved) {
      try {
        return jsonResponse(JSON.parse(saved));
      } catch {
        // invalid JSON
      }
    }
    // Return 401 without causing browser network 404
    return jsonResponse({ detail: 'Authentication credentials were not provided.' }, 401);
  }

  // 2. Authentication: /api/v1/auth/login
  if (path.endsWith('/api/v1/auth/login')) {
    let body = {};
    if (typeof options.body === 'string') {
      try { body = JSON.parse(options.body); } catch {}
    }
    const input = String(body.email || body.username || 'inspector_singh').toLowerCase();
    const officer = DEMO_OFFICERS.find(o =>
      input.includes(o.username) || input.includes(o.role.toLowerCase()) || input.includes('sharma') || input.includes('admin')
    ) || DEMO_OFFICERS[0];

    const userObj = {
      id: officer.id,
      username: officer.username,
      email: officer.email,
      name: officer.name,
      role: officer.role,
      badge: officer.badge,
      rank: officer.rank,
      agency: officer.agency,
    };
    localStorage.setItem('crimecast_demo_user', JSON.stringify(userObj));
    return jsonResponse({
      access: 'mock-access-token-sih-2026',
      refresh: 'mock-refresh-token-sih-2026',
      user: userObj,
    }, 200);
  }

  // 3. Registration: /api/v1/auth/register
  if (path.endsWith('/api/v1/auth/register')) {
    let body = {};
    if (typeof options.body === 'string') {
      try { body = JSON.parse(options.body); } catch {}
    }
    const userObj = {
      id: 99,
      username: body.username || 'registered_officer',
      email: body.email || 'officer@crimecast.gov.in',
      name: body.full_name || body.name || 'Officer',
      role: body.role || 'Analyst',
      badge: '👮 Officer Unit',
      rank: 'Authorized Officer',
      agency: body.agency || 'Cyber Crime Division',
    };
    localStorage.setItem('crimecast_demo_user', JSON.stringify(userObj));
    return jsonResponse({
      message: 'Officer unit registered successfully.',
      access: 'mock-access-token-sih-2026',
      user: userObj,
    }, 201);
  }

  // 4. Logout: /api/v1/auth/logout
  if (path.endsWith('/api/v1/auth/logout')) {
    localStorage.removeItem('crimecast_demo_user');
    return jsonResponse({ detail: 'Successfully logged out.' }, 200);
  }

  // 5. Dashboard Stats: /api/v1/dashboard/stats
  if (path.includes('/dashboard/stats')) {
    const stats = await getLiveStats();
    return jsonResponse(stats, 200);
  }

  // 6. Evidence Vault: /api/v1/complaints/evidence
  if (path.includes('/complaints/evidence')) {
    if (method === 'POST' && path.includes('/verify')) {
      const parts = path.split('/');
      const evId = parts[parts.length - 2];
      const item = MOCK_EVIDENCE_LIST.find(e => e.id === evId) || MOCK_EVIDENCE_LIST[0];
      return jsonResponse({
        success: true,
        sha256_hash: item.sha256_hash,
        message: 'Cryptographic SHA-256 seal matches stored evidence master. Tamper check: 100% Intact.'
      }, 200);
    }
    if (method === 'POST') {
      let body = {};
      if (typeof options.body === 'string') {
        try { body = JSON.parse(options.body); } catch {}
      }
      const newEv = {
        id: `EV-2026-${Math.floor(100 + Math.random() * 900)}`,
        complaint_number: body.complaint_id || 'NCRP-2026-IN-98214',
        title: body.title || 'Sec 91 CrPC Directive / Evidence Artifact',
        evidence_type: body.evidence_type || 'CCTV_REQUEST',
        evidence_type_display: body.evidence_type === 'CCTV_REQUEST' ? 'CCTV Directive' : 'Secured Evidence',
        description: body.description || `ATM Directive for ${body.atm_id || 'Kiosk'} (${body.bank_name || 'Bank'})`,
        sha256_hash: Array.from({length: 64}, () => Math.floor(Math.random()*16).toString(16)).join(''),
        atm_id: body.atm_id || 'ATM-HDFC-ALLD-04',
        target_bank: body.bank_name || 'HDFC Bank Ltd',
        atm_address: body.atm_address || 'Civil Lines, Prayagraj',
        created_at: new Date().toISOString(),
        custody_logs: [
          { action: 'INITIAL_SEAL', timestamp: new Date().toISOString(), details: 'Issued and sealed in tamper-evident vault.', performed_by: 'Insp. Singh', role: 'Field Officer', ip_address: '10.24.18.91' }
        ]
      };
      MOCK_EVIDENCE_LIST.unshift(newEv);
      return jsonResponse(newEv, 201);
    }
    return jsonResponse({ count: MOCK_EVIDENCE_LIST.length, results: MOCK_EVIDENCE_LIST }, 200);
  }

  // 7. Complaints List & Creation: /api/v1/complaints
  if (path === '/api/v1/complaints' || path.endsWith('/api/v1/complaints')) {
    if (method === 'POST') {
      let body = {};
      if (typeof options.body === 'string') {
        try { body = JSON.parse(options.body); } catch {}
      }
      const newComplaint = mapSupabaseRowToComplaint({
        id: `CMP-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        complaint_number: `NCRP-2026-IN-${Math.floor(10000 + Math.random() * 90000)}`,
        category: body.category || 'UPI Fraud',
        sub_category: body.sub_category || 'Unauthorized Transaction',
        amount_lost: Number(body.amount_lost) || 50000,
        priority: 'CRITICAL',
        status: 'NEW',
        incident_date: new Date().toISOString(),
        created_at: new Date().toISOString(),
        state: body.state || 'Karnataka',
        district: body.district || 'Bengaluru Urban',
        suspect_account: body.suspect_account || '883920194821',
        suspect_bank: body.suspect_bank || 'State Bank of India',
        complainant_name: body.complainant_name || 'Complainant',
        isLocalCreated: true,
      }, 0);
      MOCK_COMPLAINTS.unshift(newComplaint);
      // Attempt insert into Supabase as best-effort
      try {
        await supabase.from('complaints').insert([{
          complaint_number: newComplaint.acknowledgement_number,
          victim_name: newComplaint.complainant_name,
          victim_phone: '9845012345',
          victim_district: newComplaint.district,
          victim_state: newComplaint.state,
          fraud_amount: newComplaint.amount_lost,
          fraud_method: newComplaint.category,
          narrative_text: body.narrative_text || 'Reported via CrimeCast Portal',
          status: 'PREDICTION_ACTIVE',
          priority: 'CRITICAL'
        }]);
      } catch (sbErr) {
        // Ignored if RLS prevents anon insert
      }
      return jsonResponse(newComplaint, 201);
    }

    let list = await fetchLiveComplaints();
    
    // Parse search & status parameters
    try {
      const dummyUrl = new URL(endpoint.startsWith('/') ? `http://localhost${endpoint}` : endpoint);
      const searchParam = (dummyUrl.searchParams.get('search') || '').toLowerCase();
      const statusParam = dummyUrl.searchParams.get('status');

      if (searchParam) {
        list = list.filter(c => 
          (c.victim_name && c.victim_name.toLowerCase().includes(searchParam)) ||
          (c.complainant_name && c.complainant_name.toLowerCase().includes(searchParam)) ||
          (c.id && c.id.toLowerCase().includes(searchParam)) ||
          (c.acknowledgement_number && c.acknowledgement_number.toLowerCase().includes(searchParam)) ||
          (c.district && c.district.toLowerCase().includes(searchParam)) ||
          (c.state && c.state.toLowerCase().includes(searchParam)) ||
          (c.suspect_bank && c.suspect_bank.toLowerCase().includes(searchParam)) ||
          (c.suspect_account && c.suspect_account.toLowerCase().includes(searchParam))
        );
      }
      if (statusParam) {
        list = list.filter(c => c.status === statusParam);
      }
    } catch {}

    return jsonResponse({
      count: list.length,
      next: null,
      previous: null,
      results: list,
    }, 200);
  }

  // 8. Single Complaint Detail: /api/v1/complaints/:id
  if (path.includes('/api/v1/complaints/')) {
    const parts = path.split('/');
    const id = parts[parts.length - 1];
    const list = await fetchLiveComplaints();
    const found = list.find(c => c.id === id || c.acknowledgement_number === id || c.complaint_number === id) || list[0];
    return jsonResponse(found, 200);
  }

  // 9. Predictions: /api/v1/predictions
  if (path.includes('/predictions/data/model-metrics')) {
    return jsonResponse({
      model_name: 'Calibrated LightGBM v3.0 (40 Districts)',
      overall_accuracy: 0.942,
      top_1_accuracy: 0.884,
      top_3_accuracy: 0.968,
      brier_score: 0.041,
      expected_calibration_error: 0.019,
      auc_roc: 0.974,
      sample_count: 50000,
    }, 200);
  }

  if (path.includes('/predictions/alerts')) {
    const preds = await getLivePredictions();
    return jsonResponse({ count: preds.length, results: preds }, 200);
  }

  if (path.includes('/predictions/simulate-webhook')) {
    return jsonResponse({ success: true, message: 'Simulation dispatched' }, 200);
  }

  // LEA Dispatches Rollup
  if (path.includes('/predictions/lea-dispatches/rollup')) {
    return jsonResponse([
      {
        id: 'ROLLUP-JMT-01',
        jurisdiction: 'Jamtara Cyber District',
        target_district: 'Jamtara',
        active_dispatches: 4,
        total_intercepted_amount: 1450000,
        risk_level: 'CRITICAL',
        assigned_officers: ['Insp. Singh', 'Constable Kumar'],
        hotspot_atms: ['ATM-JMT-001 (SBI)', 'ATM-JMT-002 (HDFC)'],
      },
      {
        id: 'ROLLUP-NUH-02',
        jurisdiction: 'Mewat / Nuh Cyber Cell',
        target_district: 'Nuh',
        active_dispatches: 2,
        total_intercepted_amount: 890000,
        risk_level: 'HIGH',
        assigned_officers: ['DSP Sharma'],
        hotspot_atms: ['ATM-NUH-004 (PNB)'],
      }
    ], 200);
  }

  // LEA Dispatches List
  if (path.includes('/predictions/lea-dispatches')) {
    const dispatches = [
      {
        id: "DISP-JMT-0091",
        target_district: "Jamtara",
        status: "SENT",
        sent_at: new Date(Date.now() - 420000).toISOString(),
        risk_level: "CRITICAL",
        candidate_atms: [
          { atm_id: "ATM-JMT-001", bank: "SBI", address: "Main Market Branch, Jamtara, Jharkhand", lat: 23.9620, lon: 86.8020 },
          { atm_id: "ATM-JMT-002", bank: "HDFC Bank", address: "Station Road, Jamtara, Jharkhand", lat: 23.9590, lon: 86.7980 }
        ],
        package: {
          package_id: "PKG-JMT-8812",
          complaint: {
            acknowledgement_no: "NCRP-2026-IN-98214",
            fraud_amount: 485000,
            victim_district: "Bengaluru Urban",
            victim_state: "Karnataka",
            fraud_method: "Phishing QR Code / Remote Access Screen Share"
          }
        }
      },
      {
        id: "DISP-NUH-0042",
        target_district: "Gurugram",
        status: "ACKNOWLEDGED",
        sent_at: new Date(Date.now() - 1800000).toISOString(),
        risk_level: "HIGH",
        candidate_atms: [
          { atm_id: "ATM-GUR-011", bank: "ICICI Bank", address: "Cyber Hub Ground Floor, Gurugram", lat: 28.4595, lon: 77.0266 }
        ],
        package: {
          package_id: "PKG-GUR-9012",
          complaint: {
            acknowledgement_no: "NCRP-2026-IN-98218",
            fraud_amount: 85000,
            victim_district: "Gurugram",
            victim_state: "Haryana",
            fraud_method: "Loan App Harassment"
          }
        }
      }
    ];
    return jsonResponse({ count: dispatches.length, results: dispatches }, 200);
  }

  // Gateway Monitor Webhooks
  if (path.includes('/predictions/gateway/webhooks')) {
    return jsonResponse({
      gateway_status: "OPERATIONAL",
      uptime_percent: 99.98,
      active_channels: {
        iso8583_banking_switch: { status: "ONLINE", latency_ms: 14, tps: 342 },
        npci_14c_webhook_stream: { status: "ONLINE", latency_ms: 22, queue_depth: 0 },
        mha_1930_ncrp_sync: { status: "ONLINE", latency_ms: 48, sync_status: "SYNCED" },
        state_cctns_dispatch: { status: "ONLINE", active_nodes: 36 }
      },
      recent_webhooks: [
        {
          id: "WH-SBI-88219",
          source: "State Bank of India (ISO 8583 Switch)",
          event: "HIGH_VELOCITY_ATM_WITHDRAWAL",
          amount: 45000,
          location: "Jamtara Main Market ATM",
          timestamp: new Date().toLocaleTimeString(),
          validation: "PASSED_HMAC_SHA256"
        },
        {
          id: "WH-HDFC-99120",
          source: "HDFC Fraud Interception Webhook",
          event: "MULE_ACCOUNT_FREEZE_TRIGGER",
          amount: 120000,
          location: "Nuh Sector 4 ATM",
          timestamp: new Date(Date.now() - 35000).toLocaleTimeString(),
          validation: "PASSED_HMAC_SHA256"
        },
        {
          id: "WH-MHA-1930-44",
          source: "MHA 1930 National Cyber Helpline",
          event: "LIVE_COMPLAINT_INGRESS",
          amount: 85000,
          location: "Mathura Cyber Cell",
          timestamp: new Date(Date.now() - 75000).toLocaleTimeString(),
          validation: "VERIFIED_GOV_SIGNATURE"
        }
      ]
    }, 200);
  }

  if (path.includes('/predictions/data/model-metrics')) {
    return jsonResponse({
      model_name: 'Calibrated LightGBM v3.0 (40 Districts)',
      overall_accuracy: 0.942,
      top_1_accuracy: 0.884,
      top_3_accuracy: 0.968,
      brier_score: 0.041,
      expected_calibration_error: 0.019,
      auc_roc: 0.974,
      sample_count: 50000,
      metrics: {
        top1: 0.884,
        top3: 0.968,
        top5: 0.985,
        brier: 0.041,
        auc_roc: 0.974,
        sample_size: 50000,
      }
    }, 200);
  }

  if (path.includes('/api/v1/predictions/')) {
    const parts = path.split('/');
    const predId = parts[parts.length - 1];
    const preds = await getLivePredictions();
    const found = preds.find(p => p.id === predId || p.complaint === predId || p.complaint_ack === predId) || preds[0];
    return jsonResponse(found, 200);
  }

  if (path.endsWith('/api/v1/predictions')) {
    const preds = await getLivePredictions();
    return jsonResponse({
      count: preds.length,
      results: preds,
    }, 200);
  }

  // 10. Freeze Queue: /api/v1/freeze/queue or /api/v2/freeze
  if (path.includes('/freeze')) {
    return jsonResponse({ count: MOCK_FREEZE_QUEUE.length, results: MOCK_FREEZE_QUEUE }, 200);
  }

  // 11. Graph Network: /api/v1/graph or /api/v2/graph
  if (path.includes('/graph')) {
    return jsonResponse(MOCK_GRAPH_NETWORK, 200);
  }

  // 12. CyberGuru AI Assistant: /api/v1/guru/query or chat
  if (path.includes('/guru')) {
    return jsonResponse({
      answer: 'Analysis complete: This complaint displays multi-hop mule layering characteristic of Operation Garuda. Recommendation: Execute Section 106 BNSS freeze order immediately on Tier-1 HDFC account.',
      confidence: 0.96,
      recommendation: 'Freeze Tier-1 account and dispatch beat officer to Koramangala ATM Cluster.',
    }, 200);
  }

  // Fallback generic 200 JSON for other API queries
  return jsonResponse({ status: 'ok', results: [], message: 'CrimeCast static showcase mock' }, 200);
}
