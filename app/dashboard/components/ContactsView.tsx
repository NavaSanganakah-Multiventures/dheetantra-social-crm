import React, { useState, useEffect, useRef } from 'react';
import { Download, Copy, Upload, MessageSquare, Search, Send, Phone, X, Users, Plus, Trash2, Edit, Instagram, Facebook, Mail, Coins } from 'lucide-react';
import Papa from 'papaparse';
import PhoneInput, { isValidPhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { useToast } from '@/components/ui/Toast';
import { activeTab } from '../lib/types';

export function ContactsView({
  setActiveTab,
  setActiveChat
}: {
  setActiveTab: (tab: activeTab) => void,
  setActiveChat: (chat: any) => void
}) {
  const { toast } = useToast();
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [subTab, setSubTab] = useState<'all' | 'leads'>('all');

  // Selection and Export state
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [copyFormat, setCopyFormat] = useState<'newline' | 'comma'>('newline');

  // Form state
  const [showModal, setShowModal] = useState(false);
  const [isEdit, setIsEdit] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAdditionalPhone, setFormAdditionalPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formGender, setFormGender] = useState("");
  const [formInstagram, setFormInstagram] = useState("");
  const [formFacebook, setFormFacebook] = useState("");
  const [formWhatsApp, setFormWhatsApp] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formIsLead, setFormIsLead] = useState(false);
  const [formLeadStatus, setFormLeadStatus] = useState("new");
  const [formLeadSource, setFormLeadSource] = useState("manual");
  const [formLeadValue, setFormLeadValue] = useState("0");

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const parsedContacts = results.data;
        const wId = localStorage.getItem('workspaceId');

        try {
          const res = await fetch('/api/crm/contacts/import', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-workspace-id': wId || ''
            },
            body: JSON.stringify({ contacts: parsedContacts })
          });

          const data: any = await res.json();
          if (data.success) {
            alert(`सफलतापूर्वक ${data.imported} संपर्क आयात किए गए`);
            loadContacts();
          } else {
            alert(data.error || 'संपर्क आयात करने में विफल');
          }
        } catch (error) {
          alert('संपर्क आयात करते समय त्रुटि हुई');
        } finally {
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (error: any) => {
        alert('CSV पार्स करने में विफल: ' + error.message);
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };
  const loadContacts = () => {
    const wId = localStorage.getItem('workspaceId');
    fetch('/api/crm/contacts', {
      headers: { 'x-workspace-id': wId || '' }
    })
    .then(res => res.json())
    .then((data: any) => {
      if (data.contacts) {
        setContacts(data.contacts);
      }
    })
    .catch(e => console.error(e));
  };

  useEffect(() => {
    const wId = localStorage.getItem('workspaceId');
    fetch('/api/crm/contacts', {
      headers: { 'x-workspace-id': wId || '' }
    })
    .then(res => res.json())
    .then((data: any) => {
      if (data.contacts) {
        setContacts(data.contacts);
      }
      setLoading(false);
    })
    .catch(e => {
      console.error(e);
      setLoading(false);
    });
  }, []);

  const openAddModal = () => {
    setIsEdit(false);
    setSelectedContactId(null);
    setFormName("");
    setFormPhone("");
    setFormAdditionalPhone("");
    setFormEmail("");
    setFormGender("Male");
    setFormInstagram("");
    setFormFacebook("");
    setFormWhatsApp("");
    setFormNotes("");
    setFormIsLead(false);
    setFormLeadStatus("new");
    setFormLeadSource("manual");
    setFormLeadValue("0");
    setShowModal(true);
  };

  const openEditModal = (c: any) => {
    setIsEdit(true);
    setSelectedContactId(c.id);
    setFormName(c.name || "");
    const safePhone = c.phone || c.platform_contact_id || "";
    setFormPhone(safePhone ? (safePhone.startsWith('+') ? safePhone : '+' + safePhone) : "");
    const safeAddPhone = c.additional_phone || "";
    setFormAdditionalPhone(safeAddPhone ? (safeAddPhone.startsWith('+') ? safeAddPhone : '+' + safeAddPhone) : "");
    setFormEmail(c.email || "");
    setFormGender(c.gender || "Male");
    setFormInstagram(c.instagram_username || "");
    setFormFacebook(c.facebook_username || "");
    setFormWhatsApp(c.whatsapp_username || "");
    setFormNotes(c.notes || "");
    setFormIsLead(c.is_lead === 1 || c.is_lead === true);
    setFormLeadStatus(c.lead_status || "new");
    setFormLeadSource(c.lead_source || "manual");
    setFormLeadValue(String(c.lead_value || 0));
    setShowModal(true);
  };

  const saveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formPhone) {
      alert("कृपया नाम और फ़ोन नंबर भरें।");
      return;
    }
    if (!isValidPhoneNumber(formPhone)) {
      alert("मुख्य फ़ोन नंबर अमान्य है। कृपया सही नंबर और देश चुनें।");
      return;
    }
    if (formAdditionalPhone && !isValidPhoneNumber(formAdditionalPhone)) {
      alert("अतिरिक्त फ़ोन नंबर अमान्य है।");
      return;
    }

    const sanitizedPhone = formPhone.startsWith('+') ? formPhone.slice(1) : formPhone;
    const sanitizedAdditionalPhone = (formAdditionalPhone || "").startsWith('+') ? formAdditionalPhone.slice(1) : formAdditionalPhone;

    try {
      const wId = localStorage.getItem('workspaceId');
      const payload = {
        name: formName,
        phone: sanitizedPhone,
        additional_phone: sanitizedAdditionalPhone,
        email: formEmail,
        gender: formGender,
        instagram_username: formInstagram,
        facebook_username: formFacebook,
        whatsapp_username: formWhatsApp,
        notes: formNotes,
        is_lead: formIsLead ? 1 : 0,
        lead_status: formLeadStatus,
        lead_source: formLeadSource,
        lead_value: Number(formLeadValue) || 0
      };

      const url = isEdit ? `/api/crm/contacts/${selectedContactId}` : '/api/crm/contacts';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': wId || ''
        },
        body: JSON.stringify(payload)
      });

      const data: any = await res.json();
      if (res.ok || data.success) {
        setShowModal(false);
        loadContacts();
      } else {
        alert(data.error || "संपर्क सहेजने में विफल");
      }
    } catch (err) {
      alert("त्रुटि हुई");
    }
  };

  const deleteContact = async (id: string) => {
    if (!confirm("क्या आप वाकई इस संपर्क को हटाना चाहते हैं?")) return;
    try {
      const wId = localStorage.getItem('workspaceId');
      const res = await fetch(`/api/crm/contacts/${id}`, {
        method: 'DELETE',
        headers: {
          'x-workspace-id': wId || ''
        }
      });
      if (res.ok) {
        loadContacts();
      } else {
        alert("हटाने में विफल");
      }
    } catch (e) {
      alert("त्रुटि हुई");
    }
  };

  const initiateWhatsAppChat = async (contactId: string) => {
    try {
      const wId = localStorage.getItem('workspaceId');
      const res = await fetch('/api/inbox/conversations/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-workspace-id': wId || ''
        },
        body: JSON.stringify({ contactId })
      });
      const data: any = await res.json();
      if (data.success && data.conversation) {
        setActiveChat(data.conversation);
        setActiveTab('inbox');
      } else {
        alert(data.error || "चैट शुरू करने में असमर्थ। कृपया WhatsApp सेटिंग्स की जांच करें।");
      }
    } catch (e) {
      alert("चैट शुरू करने में त्रुटि हुई");
    }
  };

  const filteredContacts = contacts.filter(c => {
    const q = searchQuery.toLowerCase();
    return (
      (c.name || "").toLowerCase().includes(q) ||
      (c.phone || c.platform_contact_id || "").toLowerCase().includes(q) ||
      (c.email || "").toLowerCase().includes(q) ||
      (c.instagram_username || "").toLowerCase().includes(q) ||
      (c.facebook_username || "").toLowerCase().includes(q) ||
      (c.whatsapp_username || "").toLowerCase().includes(q)
    );
  });

  // Kanban Pipeline Stages
  const stages = [
    { key: 'new', label: 'नई लीड', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
    { key: 'contacted', label: 'संपर्कित', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
    { key: 'qualified', label: 'योग्य', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
    { key: 'closed_won', label: 'सफल', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
    { key: 'closed_lost', label: 'विफल', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800' }
  ];

  const leads = contacts.filter(c => c.is_lead === 1 || c.is_lead === true);

  const getStageStats = (stageKey: string) => {
    const stageLeads = leads.filter(l => (l.lead_status || 'new') === stageKey);
    const totalValue = stageLeads.reduce((acc, curr) => acc + (Number(curr.lead_value) || 0), 0);
    return { count: stageLeads.length, totalValue };
  };

  return (
    <div className="p-6 max-w-7xl mx-auto w-full space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-surface-900 p-4 rounded-2xl border border-surface-200/60 dark:border-surface-800/60 shadow-xs">
        <div className="flex bg-surface-100 dark:bg-surface-800 p-1 rounded-xl w-fit">
          <button
            onClick={() => setSubTab('all')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${subTab === 'all' ? 'bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-400 shadow-sm' : 'text-surface-500 hover:text-surface-800 dark:hover:text-surface-300'}`}
          >
            सभी संपर्क
          </button>
          <button
            onClick={() => setSubTab('leads')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${subTab === 'leads' ? 'bg-white dark:bg-surface-700 text-primary-600 dark:text-primary-400 shadow-sm' : 'text-surface-500 hover:text-surface-800 dark:hover:text-surface-300'}`}
          >
            लीड्स पाइपलाइन
          </button>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {selectedContactIds.size > 0 && (
            <button
              onClick={() => setExportModalOpen(true)}
              className="bg-surface-900 dark:bg-surface-100 text-white dark:text-surface-900 hover:bg-surface-800 dark:hover:bg-surface-200 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all whitespace-nowrap"
            >
              एक्सपोर्ट / कॉपी करें ({selectedContactIds.size})
            </button>
          )}
          <input
            type="file"
            accept=".csv"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="bg-white dark:bg-surface-800 hover:bg-surface-50 dark:hover:bg-surface-700 text-surface-700 dark:text-surface-300 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm border border-surface-200 dark:border-surface-700 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <Upload className={`w-4 h-4 ${importing ? 'animate-pulse' : ''}`} /> {importing ? 'आयात हो रहा है...' : 'CSV से आयात करें'}
          </button>
          <button
            onClick={openAddModal}
            className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-md shadow-primary-600/15 flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" /> नया संपर्क जोड़ें
          </button>
        </div>
      </div>

      {subTab === 'all' ? (
        <div className="space-y-4">
          {/* Search and Select All */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-surface-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="नाम, नंबर, ईमेल या सोशल आईडी से खोजें..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl outline-none focus:border-primary-500 text-sm transition-all shadow-xs"
              />
            </div>
            {filteredContacts.length > 0 && (
              <button
                onClick={() => {
                  if (selectedContactIds.size === filteredContacts.length) {
                    setSelectedContactIds(new Set());
                  } else {
                    setSelectedContactIds(new Set(filteredContacts.map(c => c.id)));
                  }
                }}
                className="whitespace-nowrap px-4 py-3 bg-white dark:bg-surface-900 border border-surface-200 dark:border-surface-800 rounded-xl text-sm font-medium hover:bg-surface-50 dark:hover:bg-surface-800 transition-all text-surface-700 dark:text-surface-300"
              >
                {selectedContactIds.size === filteredContacts.length ? 'सभी सेलेक्ट हटाएँ' : 'सभी चुनें'}
              </button>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12 text-sm text-surface-500">संपर्क लोड हो रहे हैं...</div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-surface-900 rounded-2xl border border-surface-200/50 dark:border-surface-800/50">
              <Users className="w-10 h-10 text-surface-300 mx-auto mb-3" />
              <p className="text-sm text-surface-500">कोई संपर्क नहीं मिला।</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredContacts.map(c => (
                <div key={c.id} className={`relative bg-white dark:bg-surface-900 border rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between ${selectedContactIds.has(c.id) ? 'border-primary-500 ring-1 ring-primary-500' : 'border-surface-200/60 dark:border-surface-800/60'}`}>
                  <div className="absolute top-4 right-4 z-10">
                    <input
                      type="checkbox"
                      checked={selectedContactIds.has(c.id)}
                      onChange={() => {
                        setSelectedContactIds(prev => {
                          const newSet = new Set(prev);
                          if (newSet.has(c.id)) newSet.delete(c.id);
                          else newSet.add(c.id);
                          return newSet;
                        });
                      }}
                      className="w-4 h-4 rounded border-surface-300 text-primary-600 focus:ring-primary-600 cursor-pointer"
                    />
                  </div>
                  <div>
                    {/* Header: Name and badges */}
                    <div className="flex justify-between items-start gap-2 mb-3 pr-6">
                      <div>
                        <h3 className="font-semibold text-surface-900 dark:text-surface-50 text-base flex items-center gap-1.5">
                          {c.name}
                        </h3>
                        {c.gender && (
                          <span className="text-[10px] bg-surface-100 dark:bg-surface-800 px-2 py-0.5 rounded text-surface-500 font-medium">
                            {c.gender === 'Male' ? 'पुरुष' : c.gender === 'Female' ? 'महिला' : c.gender}
                          </span>
                        )}
                      </div>
                      
                      {(c.is_lead === 1 || c.is_lead === true) && (
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                          c.lead_status === 'closed_won' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200' :
                          c.lead_status === 'closed_lost' ? 'bg-red-500/10 text-red-600 border-red-200' :
                          'bg-primary-500/10 text-primary-600 border-primary-200'
                        }`}>
                          लीड
                        </span>
                      )}
                    </div>

                    {/* Body Info */}
                    <div className="space-y-2 text-xs text-surface-600 dark:text-surface-400 border-t border-surface-100 dark:border-surface-800/50 pt-3">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-surface-400" />
                        <span><strong>मुख्य नंबर:</strong> {c.phone || c.platform_contact_id}</span>
                      </div>
                      {c.additional_phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-surface-400" />
                          <span><strong>अतिरिक्त नंबर:</strong> {c.additional_phone}</span>
                        </div>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-surface-400" />
                          <span className="truncate"><strong>ईमेल:</strong> {c.email}</span>
                        </div>
                      )}

                      {/* Social handles */}
                      {(c.instagram_username || c.facebook_username || c.whatsapp_username) && (
                        <div className="flex flex-wrap gap-2 pt-2">
                          {c.instagram_username && (
                            <span className="flex items-center gap-1 text-[11px] bg-pink-500/5 text-pink-600 dark:text-pink-400 px-2 py-0.5 rounded border border-pink-500/10">
                              <Instagram className="w-3 h-3" /> {c.instagram_username}
                            </span>
                          )}
                          {c.facebook_username && (
                            <span className="flex items-center gap-1 text-[11px] bg-blue-500/5 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-500/10">
                              <Facebook className="w-3 h-3" /> {c.facebook_username}
                            </span>
                          )}
                          {c.whatsapp_username && (
                            <span className="flex items-center gap-1 text-[11px] bg-emerald-500/5 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/10">
                              <MessageSquare className="w-3 h-3" /> {c.whatsapp_username}
                            </span>
                          )}
                        </div>
                      )}

                      {c.notes && (
                        <div className="bg-surface-50 dark:bg-surface-800/30 p-2.5 rounded-lg border border-surface-100 dark:border-surface-800/40 text-[11px] text-surface-500 mt-2 italic">
                          &ldquo;{c.notes}&rdquo;
                        </div>
                      )}

                      {/* Lead Details summary */}
                      {(c.is_lead === 1 || c.is_lead === true) && (
                        <div className="mt-3 p-2 bg-primary-50/40 dark:bg-primary-950/10 rounded-lg border border-primary-100/40 space-y-1 text-[11px]">
                          <div className="flex justify-between text-surface-500">
                            <span>लीड स्टेटस:</span>
                            <span className="font-semibold text-primary-600 dark:text-primary-400 uppercase">{c.lead_status || 'new'}</span>
                          </div>
                          <div className="flex justify-between text-surface-500">
                            <span>लीड सोर्स:</span>
                            <span className="font-semibold capitalize text-surface-700 dark:text-surface-300">{c.lead_source || 'manual'}</span>
                          </div>
                          <div className="flex justify-between text-surface-500">
                            <span>अनुमानित मूल्य:</span>
                            <span className="font-semibold text-surface-800 dark:text-surface-200">₹{(c.lead_value || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-4 pt-3 border-t border-surface-100 dark:border-surface-800/50">
                    <button
                      onClick={() => initiateWhatsAppChat(c.id)}
                      className="flex-1 bg-primary-600 hover:bg-primary-700 text-white px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                    >
                      <Send className="w-3.5 h-3.5" /> WhatsApp चैट
                    </button>
                    <button
                      onClick={() => openEditModal(c)}
                      className="p-2 border border-surface-200 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800 rounded-xl text-surface-600 dark:text-surface-400 transition-all"
                      title="संपर्क संपादित करें"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteContact(c.id)}
                      className="p-2 border border-surface-200 dark:border-surface-800 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600 rounded-xl text-surface-600 dark:text-surface-400 transition-all"
                      title="संपर्क हटाएं"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Leads Pipeline Board View */
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {stages.map(stage => {
              const { count, totalValue } = getStageStats(stage.key);
              const stageLeads = leads.filter(l => (l.lead_status || 'new') === stage.key);
              return (
                <div key={stage.key} className="bg-surface-100/50 dark:bg-surface-900/40 border border-surface-200/50 dark:border-surface-800/40 rounded-2xl p-4 flex flex-col min-h-[500px]">
                  {/* Stage Header */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold text-xs text-surface-700 dark:text-surface-300">{stage.label}</span>
                      <span className="bg-surface-200 dark:bg-surface-800 text-[10px] text-surface-600 dark:text-surface-400 px-2 py-0.5 rounded-full font-bold">{count}</span>
                    </div>
                    <div className="text-[11px] text-surface-500 flex items-center gap-1 font-mono">
                      <Coins className="w-3 h-3 text-amber-500" /> मूल्य: ₹{totalValue.toLocaleString()}
                    </div>
                  </div>

                  {/* Stage Lead Cards */}
                  <div className="flex-1 space-y-3 overflow-y-auto">
                    {stageLeads.length === 0 ? (
                      <div className="text-center py-8 text-[11px] text-surface-400 border border-dashed border-surface-200 dark:border-surface-800 rounded-xl">
                        कोई लीड नहीं
                      </div>
                    ) : (
                      stageLeads.map(lead => (
                        <div key={lead.id} className="bg-white dark:bg-surface-900 border border-surface-200/60 dark:border-surface-800/60 rounded-xl p-3 shadow-xs hover:shadow-md transition-all space-y-2">
                          <div>
                            <h4 className="font-medium text-xs text-surface-900 dark:text-surface-100 truncate">{lead.name}</h4>
                            <span className="text-[10px] text-surface-500">{lead.phone || lead.platform_contact_id}</span>
                          </div>

                          <div className="flex justify-between items-center text-[10px] text-surface-500">
                            <span className="bg-surface-100 dark:bg-surface-800 px-1.5 py-0.5 rounded capitalize">{lead.lead_source || 'manual'}</span>
                            <span className="font-bold text-surface-700 dark:text-surface-300">₹{(lead.lead_value || 0).toLocaleString()}</span>
                          </div>

                          {/* Fast Action Buttons */}
                          <div className="flex gap-1.5 pt-2 border-t border-surface-100 dark:border-surface-800/50">
                            <button
                              onClick={() => initiateWhatsAppChat(lead.id)}
                              className="flex-1 bg-primary-50 hover:bg-primary-100 dark:bg-primary-950/20 dark:hover:bg-primary-950/40 text-primary-600 dark:text-primary-400 text-[10px] py-1 rounded-md font-bold flex items-center justify-center gap-1 transition-all"
                            >
                              <Send className="w-2.5 h-2.5" /> चैट
                            </button>
                            <button
                              onClick={() => openEditModal(lead)}
                              className="p-1 border border-surface-200 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800 rounded-md text-surface-600 dark:text-surface-400 transition-all"
                            >
                              <Edit className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Edit/Add Contact Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-surface-900 rounded-2xl w-full max-w-lg overflow-hidden border border-surface-200 dark:border-surface-800 shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-surface-200 dark:border-surface-800 flex justify-between items-center bg-surface-50 dark:bg-surface-900/50">
              <h2 className="font-bold text-surface-950 dark:text-white text-base">
                {isEdit ? "संपर्क संपादित करें" : "नया संपर्क जोड़ें"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={saveContact} className="p-5 min-h-0 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Name */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-surface-500 mb-1">पूरा नाम *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="उदा. राहुल शर्मा"
                    className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700/60 rounded-xl text-sm outline-none focus:border-primary-500"
                  />
                </div>

                {/* Primary Phone */}
                <div>
                  <label className="block text-xs font-semibold text-surface-500 mb-1">मुख्य फ़ोन नंबर *</label>
                  <PhoneInput
                    international
                    defaultCountry="IN"
                    required
                    value={formPhone}
                    onChange={(val) => setFormPhone(val || '')}
                    placeholder="फ़ोन नंबर दर्ज करें"
                    className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700/60 rounded-xl text-sm outline-none focus:border-primary-500"
                  />
                </div>

                {/* Additional Phone */}
                <div>
                  <label className="block text-xs font-semibold text-surface-500 mb-1">अतिरिक्त फ़ोन नंबर</label>
                  <PhoneInput
                    international
                    defaultCountry="IN"
                    value={formAdditionalPhone}
                    onChange={(val) => setFormAdditionalPhone(val || '')}
                    placeholder="अतिरिक्त नंबर दर्ज करें"
                    className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700/60 rounded-xl text-sm outline-none focus:border-primary-500"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-surface-500 mb-1">ईमेल</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="उदा. rahul@example.com"
                    className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700/60 rounded-xl text-sm outline-none focus:border-primary-500"
                  />
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-semibold text-surface-500 mb-1">लिंग</label>
                  <select
                    value={formGender}
                    onChange={(e) => setFormGender(e.target.value)}
                    className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700/60 rounded-xl text-sm outline-none focus:border-primary-500"
                  >
                    <option value="Male">पुरुष</option>
                    <option value="Female">महिला</option>
                    <option value="Other">अन्य</option>
                  </select>
                </div>

                {/* Instagram */}
                <div>
                  <label className="block text-xs font-semibold text-surface-500 mb-1">इंस्टाग्राम यूजरनेम</label>
                  <input
                    type="text"
                    value={formInstagram}
                    onChange={(e) => setFormInstagram(e.target.value)}
                    placeholder="उदा. rahul_sharma"
                    className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700/60 rounded-xl text-sm outline-none focus:border-primary-500"
                  />
                </div>

                {/* Facebook */}
                <div>
                  <label className="block text-xs font-semibold text-surface-500 mb-1">फेसबुक यूजरनेम</label>
                  <input
                    type="text"
                    value={formFacebook}
                    onChange={(e) => setFormFacebook(e.target.value)}
                    placeholder="उदा. rahul.sharma.fb"
                    className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700/60 rounded-xl text-sm outline-none focus:border-primary-500"
                  />
                </div>

                {/* WhatsApp Username */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-surface-500 mb-1">व्हाट्सएप यूजरनेम / उपनाम</label>
                  <input
                    type="text"
                    value={formWhatsApp}
                    onChange={(e) => setFormWhatsApp(e.target.value)}
                    placeholder="उदा. Rahul S"
                    className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700/60 rounded-xl text-sm outline-none focus:border-primary-500"
                  />
                </div>

                {/* Notes */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-surface-500 mb-1">नोट्स / टिप्पणियां</label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="संपर्क के बारे में अतिरिक्त जानकारी..."
                    className="w-full px-3 py-2 bg-surface-50 dark:bg-surface-800/50 border border-surface-200 dark:border-surface-700/60 rounded-xl text-sm outline-none focus:border-primary-500 h-20 resize-none"
                  />
                </div>

                {/* Is Lead Toggle */}
                <div className="sm:col-span-2 bg-surface-50 dark:bg-surface-800/20 p-4 rounded-xl border border-surface-100 dark:border-surface-800 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-surface-800 dark:text-surface-200">क्या यह लीड है?</h4>
                    <p className="text-[10px] text-surface-400">लीड के रूप में चिह्नित करने पर आप इसे सेल्स फनल में ट्रैक कर पाएंगे।</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formIsLead}
                    onChange={(e) => setFormIsLead(e.target.checked)}
                    className="w-5 h-5 accent-primary-600 rounded cursor-pointer"
                  />
                </div>

                {/* Lead fields displayed conditionally */}
                {formIsLead && (
                  <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-primary-50/20 dark:bg-primary-950/5 p-4 rounded-xl border border-primary-100/50 dark:border-primary-900/10">
                    <div>
                      <label className="block text-xs font-semibold text-surface-500 mb-1">लीड स्टेटस</label>
                      <select
                        value={formLeadStatus}
                        onChange={(e) => setFormLeadStatus(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-sm outline-none"
                      >
                        <option value="new">नई लीड</option>
                        <option value="contacted">संपर्क किया</option>
                        <option value="qualified">योग्य लीड</option>
                        <option value="closed_won">सफल</option>
                        <option value="closed_lost">विफल</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-surface-500 mb-1">लीड सोर्स</label>
                      <select
                        value={formLeadSource}
                        onChange={(e) => setFormLeadSource(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-sm outline-none"
                      >
                        <option value="website">वेबसाइट</option>
                        <option value="facebook">फेसबुक</option>
                        <option value="instagram">इंस्टाग्राम</option>
                        <option value="whatsapp">व्हाट्सएप</option>
                        <option value="referral">रेफरल</option>
                        <option value="manual">मैनुअल</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-surface-500 mb-1">अनुमानित मूल्य (₹)</label>
                      <input
                        type="number"
                        value={formLeadValue}
                        onChange={(e) => setFormLeadValue(e.target.value)}
                        placeholder="उदा. 15000"
                        className="w-full px-3 py-2 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-lg text-sm outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="pt-4 border-t border-surface-100 dark:border-surface-800 flex gap-3">
                <button
                  type="submit"
                  className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  {isEdit ? "बदलाव सहेजें" : "संपर्क सहेजें"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 border border-surface-200 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800 rounded-xl text-xs font-medium text-surface-700 dark:text-surface-300 transition-all"
                >
                  रद्द करें
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Export / Copy Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-surface-900 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-surface-200 dark:border-surface-800 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-surface-100 dark:border-surface-800">
              <h2 className="text-lg font-bold text-surface-900 dark:text-white">एक्सपोर्ट / कॉपी करें</h2>
              <p className="text-xs text-surface-500 mt-1">{selectedContactIds.size} संपर्क चुने गए</p>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-surface-500 mb-2">कॉपी फॉरमैट</label>
                <div className="flex gap-2 p-1 bg-surface-100 dark:bg-surface-800 rounded-lg">
                  <button 
                    onClick={() => setCopyFormat('newline')}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${copyFormat === 'newline' ? 'bg-white dark:bg-surface-700 shadow-sm text-primary-600 dark:text-primary-400' : 'text-surface-500 hover:text-surface-700'}`}
                  >
                    लाइन-बाय-लाइन
                  </button>
                  <button 
                    onClick={() => setCopyFormat('comma')}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${copyFormat === 'comma' ? 'bg-white dark:bg-surface-700 shadow-sm text-primary-600 dark:text-primary-400' : 'text-surface-500 hover:text-surface-700'}`}
                  >
                    कौमा
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  onClick={() => {
                    const selected = filteredContacts.filter(c => selectedContactIds.has(c.id));
                    const values = selected.map(c => c.phone).filter(v => !!v);
                    if (!values.length) { alert('कोई फ़ोन नंबर नहीं मिला।'); return; }
                    navigator.clipboard.writeText(values.join(copyFormat === 'comma' ? ', ' : '\\n')).then(() => {
                      toast('success', `${values.length} नंबर क्लिपबोर्ड में कॉपी हो गए।`);
                      setExportModalOpen(false);
                    });
                  }}
                  className="w-full py-2.5 bg-primary-50 hover:bg-primary-100 dark:bg-primary-500/10 dark:hover:bg-primary-500/20 text-primary-700 dark:text-primary-400 text-sm font-semibold rounded-xl transition-colors text-left px-4 flex items-center justify-between"
                >
                  <span>सिर्फ फ़ोन नंबर कॉपी करें</span>
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    const selected = filteredContacts.filter(c => selectedContactIds.has(c.id));
                    const values = selected.map(c => c.email).filter(v => !!v);
                    if (!values.length) { alert('कोई ईमेल नहीं मिला।'); return; }
                    navigator.clipboard.writeText(values.join(copyFormat === 'comma' ? ', ' : '\\n')).then(() => {
                      toast('success', `${values.length} ईमेल क्लिपबोर्ड में कॉपी हो गए।`);
                      setExportModalOpen(false);
                    });
                  }}
                  className="w-full py-2.5 bg-primary-50 hover:bg-primary-100 dark:bg-primary-500/10 dark:hover:bg-primary-500/20 text-primary-700 dark:text-primary-400 text-sm font-semibold rounded-xl transition-colors text-left px-4 flex items-center justify-between"
                >
                  <span>सिर्फ ईमेल कॉपी करें</span>
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    const selected = filteredContacts.filter(c => selectedContactIds.has(c.id));
                    const csvData = selected.map(c => ({
                      'Name': c.name || '',
                      'Phone': c.phone || '',
                      'Email': c.email || '',
                      'Gender': c.gender || '',
                      'Instagram': c.instagram_username || '',
                      'Facebook': c.facebook_username || '',
                      'WhatsApp': c.whatsapp_username || '',
                      'Notes': c.notes || ''
                    }));
                    const csv = Papa.unparse(csvData);
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.setAttribute("download", "contacts_export.csv");
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setExportModalOpen(false);
                  }}
                  className="w-full py-2.5 border border-surface-200 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800 text-surface-700 dark:text-surface-300 text-sm font-semibold rounded-xl transition-colors text-left px-4 flex items-center justify-between"
                >
                  <span>CSV में एक्सपोर्ट करें</span>
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-surface-100 dark:border-surface-800 bg-surface-50 dark:bg-surface-900/50">
              <button
                onClick={() => setExportModalOpen(false)}
                className="w-full py-2.5 bg-white dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700 text-surface-700 dark:text-surface-300 border border-surface-200 dark:border-surface-700 text-sm font-semibold rounded-xl transition-colors shadow-sm"
              >
                बंद करें
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ==========================================
// CALLING FEATURES COMPONENT IMPLEMENTATIONS
// ==========================================

