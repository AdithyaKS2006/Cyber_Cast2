import React, { useState } from 'react';
import { ChevronRight, ChevronLeft, Check, Plus, Trash2, AlertCircle, Loader2, Mic, Radio, Sparkles } from 'lucide-react';
import apiClient from '../../utils/apiClient';
import VoiceIntakeAssistant from './VoiceIntakeAssistant';


// ── Field helpers ─────────────────────────────────────────────────────────
const InputField = ({ label, name, value, onChange, error, type = 'text', required, placeholder }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
      {label}{required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <input
      type={type}
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={`w-full px-3 py-2.5 rounded-xl bg-zinc-900/80 border text-[11px] text-white placeholder:text-zinc-700
                  focus:outline-none transition-colors
                  ${error ? 'border-red-500/60 focus:border-red-500' : 'border-zinc-800 focus:border-orange-500/60'}`}
    />
    {error && <p className="text-[9px] text-red-400 font-bold">{Array.isArray(error) ? error.join(', ') : (typeof error === 'object' ? JSON.stringify(error) : String(error))}</p>}
  </div>
);

const SelectField = ({ label, name, value, onChange, error, options, required }) => (
  <div className="space-y-1">
    <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
      {label}{required && <span className="text-red-500 ml-1">*</span>}
    </label>
    <select
      name={name}
      value={value}
      onChange={onChange}
      className={`w-full px-3 py-2.5 rounded-xl bg-zinc-900/80 border text-[11px] text-white
                  focus:outline-none transition-colors
                  ${error ? 'border-red-500/60' : 'border-zinc-800 focus:border-orange-500/60'}`}
    >
      <option value="">Select…</option>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    {error && <p className="text-[9px] text-red-400 font-bold">{Array.isArray(error) ? error.join(', ') : (typeof error === 'object' ? JSON.stringify(error) : String(error))}</p>}
  </div>
);

// ── Step indicator ────────────────────────────────────────────────────────
const Steps = ({ current, steps }) => (
  <div className="flex items-center gap-0">
    {steps.map((s, i) => (
      <React.Fragment key={i}>
        <div className="flex flex-col items-center">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border-2 transition-all
            ${i < current ? 'bg-orange-500 border-orange-500 text-black'
              : i === current ? 'border-orange-500 text-orange-400 bg-transparent'
              : 'border-zinc-700 text-zinc-600 bg-transparent'}`}>
            {i < current ? <Check className="w-3.5 h-3.5" /> : i + 1}
          </div>
          <span className={`text-[8px] font-black uppercase mt-1 ${i === current ? 'text-orange-400' : 'text-zinc-600'}`}>{s}</span>
        </div>
        {i < steps.length - 1 && (
          <div className={`flex-1 h-0.5 mx-2 transition-colors ${i < current ? 'bg-orange-500' : 'bg-zinc-800'}`} />
        )}
      </React.Fragment>
    ))}
  </div>
);

// ── Validation ────────────────────────────────────────────────────────────
const validateStep = (step, data) => {
  const errs = {};
  if (step === 0) {
    if (!data.victim_name?.trim())   errs.victim_name = 'Required';
    if (!data.victim_phone?.trim())  errs.victim_phone = 'Required';
    if (!/^\d{10}$/.test(data.victim_phone?.trim())) errs.victim_phone = 'Must be 10 digits';
    if (!data.victim_district?.trim()) errs.victim_district = 'Required';
    if (!data.victim_state?.trim())  errs.victim_state = 'Required';
  }
  if (step === 1) {
    if (!data.fraud_amount || isNaN(data.fraud_amount) || Number(data.fraud_amount) <= 0)
      errs.fraud_amount = 'Enter a valid amount';
    if (!data.fraud_method) errs.fraud_method = 'Select a fraud method';
    if (!data.fraud_timestamp) errs.fraud_timestamp = 'Required';
    if (!data.narrative_text?.trim() || data.narrative_text.trim().length < 20)
      errs.narrative_text = 'Minimum 20 characters';
  }
  // step 2 (chains) is optional but validate amounts
  if (step === 2) {
    data.hops?.forEach((h, i) => {
      if (!h.from_account?.trim()) errs[`hop_${i}_from_account`] = 'Required';
      if (!h.to_account?.trim())   errs[`hop_${i}_to_account`] = 'Required';
      if (!h.amount || isNaN(h.amount)) errs[`hop_${i}_amount`] = 'Invalid';
    });
  }
  return errs;
};

// ── Empty hop ─────────────────────────────────────────────────────────────
const emptyHop = () => ({
  from_account: '', from_bank: '', from_ifsc: '',
  to_account: '',   to_bank: '',   to_ifsc: '',
  amount: '', timestamp: '',
  is_mule_flagged: false, latitude: '', longitude: '',
});

// ── Main Component ────────────────────────────────────────────────────────
const ComplaintForm = ({ navigate, initialData = {} }) => {
  const STEPS = ['Victim Details', 'Fraud Details', 'Transaction Chain'];

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [showVoiceIntake, setShowVoiceIntake] = useState(false);

  const [form, setForm] = useState({
    victim_name: '', victim_phone: '', victim_email: '',
    victim_district: '', victim_state: '', victim_age: '',
    fraud_amount: '', fraud_method: '', fraud_timestamp: '',
    narrative_text: '',
    hops: [],
    ...initialData,
  });

  const handleApplyVoiceEntities = (extracted) => {
    setForm(prev => {
      const updatedHops = [...prev.hops];
      if (extracted.suspect_account || extracted.suspect_bank || extracted.suspect_ifsc) {
        if (updatedHops.length === 0) {
          updatedHops.push({
            from_account: 'Victim Primary Account',
            from_bank: prev.victim_name ? `${prev.victim_name}'s Bank` : 'Victim Primary Bank',
            from_ifsc: '',
            to_account: extracted.suspect_account || '',
            to_bank: extracted.suspect_bank || 'Unknown Bank',
            to_ifsc: extracted.suspect_ifsc || '',
            amount: extracted.fraud_amount || prev.fraud_amount || '',
            timestamp: new Date().toISOString().slice(0, 16),
            is_mule_flagged: true,
            latitude: '',
            longitude: ''
          });
        } else {
          updatedHops[0] = {
            ...updatedHops[0],
            to_account: extracted.suspect_account || updatedHops[0].to_account,
            to_bank: extracted.suspect_bank || updatedHops[0].to_bank,
            to_ifsc: extracted.suspect_ifsc || updatedHops[0].to_ifsc,
            amount: extracted.fraud_amount ? String(extracted.fraud_amount) : updatedHops[0].amount,
          };
        }
      }

      return {
        ...prev,
        victim_phone: extracted.victim_phone || prev.victim_phone,
        fraud_amount: extracted.fraud_amount ? String(extracted.fraud_amount) : prev.fraud_amount,
        fraud_method: extracted.fraud_method || prev.fraud_method || 'UPI',
        fraud_timestamp: prev.fraud_timestamp || new Date().toISOString().slice(0, 16),
        narrative_text: extracted.narrative_text || prev.narrative_text,
        hops: updatedHops,
      };
    });
  };


  const update = (e) => {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
    if (errors[name]) setErrors(prev => { const n = { ...prev }; delete n[name]; return n; });
  };

  const updateHop = (idx, field, value) => {
    setForm(f => {
      const hops = [...f.hops];
      hops[idx] = { ...hops[idx], [field]: value };
      return { ...f, hops };
    });
  };

  const addHop = () => {
    if (form.hops.length >= 5) return;
    setForm(f => ({ ...f, hops: [...f.hops, emptyHop()] }));
  };

  const removeHop = (idx) => {
    setForm(f => ({ ...f, hops: f.hops.filter((_, i) => i !== idx) }));
  };

  const goNext = () => {
    const errs = validateStep(step, form);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setErrors({});
    setStep(s => s + 1);
  };

  const goPrev = () => setStep(s => s - 1);

  const handleSubmit = async () => {
    const errs = validateStep(2, form);
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    setServerError('');
    try {
      // Step A: Create the complaint (no nested hops)
      const payload = {
        victim_name:      form.victim_name,
        victim_phone:     form.victim_phone,
        victim_email:     form.victim_email,
        victim_district:  form.victim_district,
        victim_state:     form.victim_state,
        victim_pincode:   form.victim_pincode || '000000',
        fraud_amount:     Number(form.fraud_amount),
        fraud_method:     form.fraud_method,
        fraud_timestamp:  form.fraud_timestamp,
        narrative_text:   form.narrative_text,
        priority:         'MEDIUM',
      };
      const res = await apiClient('/api/v1/complaints/', {
        method: 'POST', body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        let errMsg = errJson.detail || errJson.message;
        if (!errMsg && typeof errJson === 'object' && Object.keys(errJson).length > 0) {
          errMsg = Object.entries(errJson)
            .map(([field, msgs]) => `${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`)
            .join(' | ');
        }
        throw new Error(errMsg || `Failed to create complaint (${res.status})`);
      }
      const data = await res.json();
      const complaintId = data.id;

      // Step B: Post each hop to /chain/ endpoint
      for (let i = 0; i < form.hops.length; i++) {
        const h = form.hops[i];
        if (!h.from_account?.trim() || !h.to_account?.trim()) continue;
        await apiClient(`/api/v1/complaints/${complaintId}/chain/`, {
          method: 'POST',
          body: JSON.stringify({
            from_account:     h.from_account,
            from_bank:        h.from_bank || 'Unknown Bank',
            from_ifsc:        h.from_ifsc || '',
            to_account:       h.to_account,
            to_bank:          h.to_bank || 'Unknown Bank',
            to_ifsc:          h.to_ifsc || '',
            amount:           Number(h.amount) || Number(form.fraud_amount),
            timestamp:        h.timestamp || form.fraud_timestamp,
            hop_number:       i + 1,
            is_mule_flagged:  !!h.is_mule_flagged,
          }),
        });
      }

      navigate(`complaints/${complaintId}`);
    } catch (e) {
      const msg = typeof e === 'object' ? (e.message || JSON.stringify(e)) : String(e);
      setServerError(msg || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const FRAUD_METHODS = [
    { value: 'UPI', label: 'UPI Transfer' },
    { value: 'CARD', label: 'Card Fraud' },
    { value: 'NET_BANKING', label: 'Net Banking' },
    { value: 'PHONE_CALL', label: 'Phone Scam' },
    { value: 'EMAIL_PHISHING', label: 'Email Phishing' },
    { value: 'OTHER', label: 'Other' },
  ];

  const INDIAN_STATES = [
    'Andhra Pradesh','Arunachal Pradesh','Assam','Bihar','Chhattisgarh',
    'Goa','Gujarat','Haryana','Himachal Pradesh','Jharkhand','Karnataka',
    'Kerala','Madhya Pradesh','Maharashtra','Manipur','Meghalaya','Mizoram',
    'Nagaland','Odisha','Punjab','Rajasthan','Sikkim','Tamil Nadu','Telangana',
    'Tripura','Uttar Pradesh','Uttarakhand','West Bengal',
    'Delhi','Chandigarh','Puducherry',
  ].map(s => ({ value: s, label: s }));

  return (
    <div className="flex items-start justify-center pb-12">
      <div className="w-full max-w-2xl space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tight">New Complaint</h1>
            <p className="text-[10px] text-zinc-500 font-bold uppercase mt-1">Register a cybercrime complaint (BNSS 2023 / NCRP Standard)</p>
          </div>
          <button
            type="button"
            onClick={() => setShowVoiceIntake(v => !v)}
            className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border transition-all shadow-md ${
              showVoiceIntake
                ? 'bg-orange-500 text-black border-orange-400'
                : 'bg-zinc-900/90 text-orange-400 border-orange-500/40 hover:bg-zinc-800'
            }`}
          >
            <Radio className="w-3.5 h-3.5 animate-pulse text-red-500" />
            <span>{showVoiceIntake ? 'Close Voice Intake' : '🎙️ 1930 Live Voice Intake'}</span>
          </button>
        </div>

        {/* 1930 Voice Assistant Drawer */}
        {showVoiceIntake && (
          <VoiceIntakeAssistant
            onApplyEntities={handleApplyVoiceEntities}
            onClose={() => setShowVoiceIntake(false)}
          />
        )}

        {/* Step bar */}
        <Steps current={step} steps={STEPS} />


        {/* Form card */}
        <div className="cc-card-bg rounded-2xl border border-zinc-800/60 p-6 space-y-5">

          {/* STEP 0: Victim Details */}
          {step === 0 && (
            <>
              <h2 className="text-sm font-black text-orange-400 uppercase tracking-widest">Victim Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Full Name" name="victim_name" value={form.victim_name} onChange={update} error={errors.victim_name} required placeholder="e.g. John Doe" />
                <InputField label="Phone Number" name="victim_phone" value={form.victim_phone} onChange={update} error={errors.victim_phone} required placeholder="e.g. 9876543210" />
                <InputField label="Email" name="victim_email" value={form.victim_email} onChange={update} type="email" placeholder="Optional" />
                <InputField label="Age" name="victim_age" value={form.victim_age} onChange={update} type="number" placeholder="e.g. 35" />
                <InputField label="District" name="victim_district" value={form.victim_district} onChange={update} error={errors.victim_district} required placeholder="e.g. District Name" />
                <SelectField label="State" name="victim_state" value={form.victim_state} onChange={update} error={errors.victim_state} options={INDIAN_STATES} required />
              </div>
            </>
          )}

          {/* STEP 1: Fraud Details */}
          {step === 1 && (
            <>
              <h2 className="text-sm font-black text-orange-400 uppercase tracking-widest">Fraud Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <InputField label="Fraud Amount (₹)" name="fraud_amount" value={form.fraud_amount} onChange={update} error={errors.fraud_amount} required type="number" placeholder="e.g. 50000" />
                <SelectField label="Fraud Method" name="fraud_method" value={form.fraud_method} onChange={update} error={errors.fraud_method} options={FRAUD_METHODS} required />
                <div className="col-span-2">
                  <InputField label="Date & Time of Fraud" name="fraud_timestamp" value={form.fraud_timestamp} onChange={update} error={errors.fraud_timestamp} required type="datetime-local" />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                    Complaint Narrative <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="narrative_text"
                    value={form.narrative_text}
                    onChange={update}
                    rows={5}
                    placeholder="Describe in detail what happened, how the fraud was committed, any numbers or links shared…"
                    className={`w-full px-3 py-2.5 rounded-xl bg-zinc-900/80 border text-[11px] text-white placeholder:text-zinc-700
                                focus:outline-none transition-colors resize-none
                                ${errors.narrative_text ? 'border-red-500/60' : 'border-zinc-800 focus:border-orange-500/60'}`}
                  />
                  {errors.narrative_text && <p className="text-[9px] text-red-400 font-bold">{Array.isArray(errors.narrative_text) ? errors.narrative_text.join(', ') : (typeof errors.narrative_text === 'object' ? JSON.stringify(errors.narrative_text) : String(errors.narrative_text))}</p>}
                </div>
              </div>
            </>
          )}

          {/* STEP 2: Transaction Chain */}
          {step === 2 && (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black text-orange-400 uppercase tracking-widest">Transaction Chain</h2>
                <button onClick={addHop} disabled={form.hops.length >= 5}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase transition-colors disabled:opacity-30"
                        style={{ background: 'rgba(249,115,22,0.15)', color: '#f97316' }}>
                  <Plus className="w-3 h-3" /> Add Hop
                </button>
              </div>

              {form.hops.length === 0 && (
                <div className="text-center py-8 space-y-2">
                  <p className="text-[10px] text-zinc-600 font-bold uppercase">No transaction hops added</p>
                  <p className="text-[9px] text-zinc-700 uppercase">Optional — add if you have bank transfer details</p>
                </div>
              )}

              {form.hops.map((hop, i) => (
                <div key={i} className="border border-zinc-800/60 rounded-xl p-4 space-y-3"
                     style={{ background: 'rgba(249,115,22,0.02)' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-black text-orange-400 uppercase">Hop {i + 1}</span>
                    <button onClick={() => removeHop(i)} className="text-zinc-700 hover:text-red-400 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <InputField label="From Account" name={`h${i}_fa`} value={hop.from_account}
                      onChange={e => updateHop(i, 'from_account', e.target.value)}
                      error={errors[`hop_${i}_from_account`]} placeholder="e.g. 123456789" />
                    <InputField label="From Bank" name={`h${i}_fb`} value={hop.from_bank}
                      onChange={e => updateHop(i, 'from_bank', e.target.value)} placeholder="e.g. SBI" />
                    <InputField label="Amount (₹)" name={`h${i}_amt`} value={hop.amount}
                      onChange={e => updateHop(i, 'amount', e.target.value)}
                      error={errors[`hop_${i}_amount`]} type="number" placeholder="e.g. 10000" />
                    <InputField label="To Account" name={`h${i}_ta`} value={hop.to_account}
                      onChange={e => updateHop(i, 'to_account', e.target.value)}
                      error={errors[`hop_${i}_to_account`]} placeholder="e.g. 987654321" />
                    <InputField label="To Bank" name={`h${i}_tb`} value={hop.to_bank}
                      onChange={e => updateHop(i, 'to_bank', e.target.value)} placeholder="e.g. HDFC" />
                    <InputField label="Timestamp" name={`h${i}_ts`} value={hop.timestamp}
                      onChange={e => updateHop(i, 'timestamp', e.target.value)} type="datetime-local" />
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id={`mule_${i}`} checked={hop.is_mule_flagged}
                           onChange={e => updateHop(i, 'is_mule_flagged', e.target.checked)}
                           className="accent-orange-500" />
                    <label htmlFor={`mule_${i}`} className="text-[9px] font-bold text-zinc-500 uppercase cursor-pointer">
                      Flag as mule account
                    </label>
                  </div>
                </div>
              ))}
            </>
          )}

          {serverError && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-900/20 border border-red-500/30">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-[10px] text-red-400 font-bold">
                {typeof serverError === 'object' ? JSON.stringify(serverError) : String(serverError)}
              </p>
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="flex justify-between">
          <button onClick={step === 0 ? () => navigate('complaints') : goPrev}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-[10px] font-black uppercase text-zinc-400 hover:text-white transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
            {step === 0 ? 'Cancel' : 'Back'}
          </button>

          {step < 2 ? (
            <button onClick={goNext}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)', color: 'black' }}>
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, #f97316, #ef4444)', color: 'black' }}>
              {submitting ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Submitting…</> : <><Check className="w-3.5 h-3.5" /> Submit Complaint</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ComplaintForm;
