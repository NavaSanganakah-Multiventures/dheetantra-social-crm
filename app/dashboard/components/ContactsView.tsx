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
            alert(`à¤¸à¤«à¤²à¤¤à¤¾à¤ªà¥‚à¤°à¥à¤µà¤• ${data.imported} à¤¸à¤‚à¤ªà¤°à¥à¤• à¤†à¤¯à¤¾à¤¤ à¤•à¤¿à¤ à¤—à¤ (Successfully imported ${data.imported} contacts)`);
            loadContacts();
          } else {
            alert(data.error || 'à¤¸à¤‚à¤ªà¤°à¥à¤• à¤†à¤¯à¤¾à¤¤ à¤•à¤°à¤¨à¥‡ à¤®à¥‡à¤‚ à¤µà¤¿à¤«à¤²');
          }
        } catch (error) {
          alert('à¤¸à¤‚à¤ªà¤°à¥à¤• à¤†à¤¯à¤¾à¤¤ à¤•à¤°à¤¤à¥‡ à¤¸à¤®à¤¯ à¤¤à¥à¤°à¥à¤Ÿà¤¿ à¤¹à¥à¤ˆ');
        } finally {
          setImporting(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (error: any) => {
        alert('CSV à¤ªà¤¾à¤°à¥à¤¸ à¤•à¤°à¤¨à¥‡ à¤®à¥‡à¤‚ à¤µà¤¿à¤«à¤²: ' + error.message);
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
      alert("à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¨à¤¾à¤® à¤”à¤° à¤«à¤¼à¥‹à¤¨ à¤¨à¤‚à¤¬à¤° à¤­à¤°à¥‡à¤‚à¥¤");
      return;
    }
    if (!isValidPhoneNumber(formPhone)) {
      alert("à¤®à¥à¤–à¥à¤¯ à¤«à¤¼à¥‹à¤¨ à¤¨à¤‚à¤¬à¤° à¤…à¤®à¤¾à¤¨à¥à¤¯ à¤¹à¥ˆà¥¤ à¤•à¥ƒà¤ªà¤¯à¤¾ à¤¸à¤¹à¥€ à¤¨à¤‚à¤¬à¤° à¤”à¤° à¤¦à¥‡à¤¶ à¤šà¥à¤¨à¥‡à¤‚à¥¤ (Invalid phone number)");
      return;
    }
    if (formAdditionalPhone && !isValidPhoneNumber(formAdditionalPhone)) {
      alert("à¤…à¤¤à¤¿à¤°à¤¿à¤•à¥à¤¤ à¤«à¤¼à¥‹à¤¨ à¤¨à¤‚à¤¬à¤° à¤…à¤®à¤¾à¤¨à¥à¤¯ à¤¹à¥ˆà¥¤ (Invalid additional phone number)");
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
        alert(data.error || "à¤¸à¤‚à¤ªà¤°à¥à¤• à¤¸à¤¹à¥‡à¤œà¤¨à¥‡ à¤®à¥‡à¤‚ à¤µà¤¿à¤«à¤²");
      }
    } catch (err) {
      alert("à¤¤à¥à¤°à¥à¤Ÿà¤¿ à¤¹à¥à¤ˆ");
    }
  };

  const deleteContact = async (id: string) => {
    if (!confirm("à¤•à¥à¤¯à¤¾ à¤†à¤ª à¤µà¤¾à¤•à¤ˆ à¤‡à¤¸ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤•à¥‹ à¤¹à¤Ÿà¤¾à¤¨à¤¾ à¤šà¤¾à¤¹à¤¤à¥‡ à¤¹à¥ˆà¤‚?")) return;
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
        alert("à¤¹à¤Ÿà¤¾à¤¨à¥‡ à¤®à¥‡à¤‚ à¤µà¤¿à¤«à¤²");
      }
    } catch (e) {
      alert("à¤¤à¥à¤°à¥à¤Ÿà¤¿ à¤¹à¥à¤ˆ");
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
        alert(data.error || "à¤šà¥ˆà¤Ÿ à¤¶à¥à¤°à¥‚ à¤•à¤°à¤¨à¥‡ à¤®à¥‡à¤‚ à¤…à¤¸à¤®à¤°à¥à¤¥à¥¤ à¤•à¥ƒà¤ªà¤¯à¤¾ WhatsApp à¤¸à¥‡à¤Ÿà¤¿à¤‚à¤—à¥à¤¸ à¤•à¥€ à¤œà¤¾à¤‚à¤š à¤•à¤°à¥‡à¤‚à¥¤");
      }
    } catch (e) {
      alert("à¤šà¥ˆà¤Ÿ à¤¶à¥à¤°à¥‚ à¤•à¤°à¤¨à¥‡ à¤®à¥‡à¤‚ à¤¤à¥à¤°à¥à¤Ÿà¤¿ à¤¹à¥à¤ˆ");
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
    { key: 'new', label: 'à¤¨à¤ˆ à¤²à¥€à¤¡ (New)', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800' },
    { key: 'contacted', label: 'à¤¸à¤‚à¤ªà¤°à¥à¤•à¤¿à¤¤ (Contacted)', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800' },
    { key: 'qualified', label: 'à¤¯à¥‹à¤—à¥à¤¯ (Qualified)', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800' },
    { key: 'closed_won', label: 'à¤¸à¤«à¤² (Won)', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800' },
    { key: 'closed_lost', label: 'à¤µà¤¿à¤«à¤² (Lost)', color: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-200 dark:border-rose-800' }
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 shadow-xs">
        <div className="flex bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl w-fit">
          <button
            onClick={() => setSubTab('all')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${subTab === 'all' ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}`}
          >
            à¤¸à¤­à¥€ à¤¸à¤‚à¤ªà¤°à¥à¤• (All Contacts)
          </button>
          <button
            onClick={() => setSubTab('leads')}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all ${subTab === 'leads' ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300'}`}
          >
            à¤²à¥€à¤¡à¥à¤¸ à¤ªà¤¾à¤‡à¤ªà¤²à¤¾à¤‡à¤¨ (Leads Pipeline)
          </button>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {selectedContactIds.size > 0 && (
            <button
              onClick={() => setExportModalOpen(true)}
              className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm transition-all whitespace-nowrap"
            >
              à¤à¤•à¥à¤¸à¤ªà¥‹à¤°à¥à¤Ÿ / à¤•à¥‰à¤ªà¥€ à¤•à¤°à¥‡à¤‚ ({selectedContactIds.size})
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
            className="bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 px-4 py-2 rounded-xl text-xs font-semibold shadow-sm border border-zinc-200 dark:border-zinc-700 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <Upload className={`w-4 h-4 ${importing ? 'animate-pulse' : ''}`} /> {importing ? 'à¤†à¤¯à¤¾à¤¤ à¤¹à¥‹ à¤°à¤¹à¤¾ à¤¹à¥ˆ...' : 'CSV à¤¸à¥‡ à¤†à¤¯à¤¾à¤¤ à¤•à¤°à¥‡à¤‚ (Import)'}
          </button>
          <button
            onClick={openAddModal}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-semibold shadow-md shadow-indigo-600/15 flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" /> à¤¨à¤¯à¤¾ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤œà¥‹à¥œà¥‡à¤‚ (Add Contact)
          </button>
        </div>
      </div>

      {subTab === 'all' ? (
        <div className="space-y-4">
          {/* Search and Select All */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="à¤¨à¤¾à¤®, à¤¨à¤‚à¤¬à¤°, à¤ˆà¤®à¥‡à¤² à¤¯à¤¾ à¤¸à¥‹à¤¶à¤² à¤†à¤ˆà¤¡à¥€ à¤¸à¥‡ à¤–à¥‹à¤œà¥‡à¤‚..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none focus:border-indigo-500 text-sm transition-all shadow-xs"
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
                className="whitespace-nowrap px-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all text-zinc-700 dark:text-zinc-300"
              >
                {selectedContactIds.size === filteredContacts.length ? 'à¤¸à¤­à¥€ à¤¸à¥‡à¤²à¥‡à¤•à¥à¤Ÿ à¤¹à¤Ÿà¤¾à¤à¤ (Deselect All)' : 'à¤¸à¤­à¥€ à¤šà¥à¤¨à¥‡à¤‚ (Select All)'}
              </button>
            )}
          </div>

          {loading ? (
            <div className="text-center py-12 text-sm text-zinc-500">à¤¸à¤‚à¤ªà¤°à¥à¤• à¤²à¥‹à¤¡ à¤¹à¥‹ à¤°à¤¹à¥‡ à¤¹à¥ˆà¤‚...</div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-16 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50">
              <Users className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">à¤•à¥‹à¤ˆ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredContacts.map(c => (
                <div key={c.id} className={`relative bg-white dark:bg-zinc-900 border rounded-2xl p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between ${selectedContactIds.has(c.id) ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-zinc-200/60 dark:border-zinc-800/60'}`}>
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
                      className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                    />
                  </div>
                  <div>
                    {/* Header: Name and badges */}
                    <div className="flex justify-between items-start gap-2 mb-3 pr-6">
                      <div>
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-50 text-base flex items-center gap-1.5">
                          {c.name}
                        </h3>
                        {c.gender && (
                          <span className="text-[10px] bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-500 font-medium">
                            {c.gender === 'Male' ? 'à¤ªà¥à¤°à¥à¤· (Male)' : c.gender === 'Female' ? 'à¤®à¤¹à¤¿à¤²à¤¾ (Female)' : c.gender}
                          </span>
                        )}
                      </div>
                      
                      {(c.is_lead === 1 || c.is_lead === true) && (
                        <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                          c.lead_status === 'closed_won' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-200' :
                          c.lead_status === 'closed_lost' ? 'bg-red-500/10 text-red-600 border-red-200' :
                          'bg-indigo-500/10 text-indigo-600 border-indigo-200'
                        }`}>
                          LEAD
                        </span>
                      )}
                    </div>

                    {/* Body Info */}
                    <div className="space-y-2 text-xs text-zinc-600 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800/50 pt-3">
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-zinc-400" />
                        <span><strong>à¤®à¥à¤–à¥à¤¯ à¤¨à¤‚à¤¬à¤°:</strong> {c.phone || c.platform_contact_id}</span>
                      </div>
                      {c.additional_phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-zinc-400" />
                          <span><strong>à¤…à¤¤à¤¿à¤°à¤¿à¤•à¥à¤¤ à¤¨à¤‚à¤¬à¤°:</strong> {c.additional_phone}</span>
                        </div>
                      )}
                      {c.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-zinc-400" />
                          <span className="truncate"><strong>à¤ˆà¤®à¥‡à¤²:</strong> {c.email}</span>
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
                        <div className="bg-zinc-50 dark:bg-zinc-800/30 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-800/40 text-[11px] text-zinc-500 mt-2 italic">
                          &ldquo;{c.notes}&rdquo;
                        </div>
                      )}

                      {/* Lead Details summary */}
                      {(c.is_lead === 1 || c.is_lead === true) && (
                        <div className="mt-3 p-2 bg-indigo-50/40 dark:bg-indigo-950/10 rounded-lg border border-indigo-100/40 space-y-1 text-[11px]">
                          <div className="flex justify-between text-zinc-500">
                            <span>à¤²à¥€à¤¡ à¤¸à¥à¤Ÿà¥‡à¤Ÿà¤¸:</span>
                            <span className="font-semibold text-indigo-600 dark:text-indigo-400 uppercase">{c.lead_status || 'new'}</span>
                          </div>
                          <div className="flex justify-between text-zinc-500">
                            <span>à¤²à¥€à¤¡ à¤¸à¥‹à¤°à¥à¤¸:</span>
                            <span className="font-semibold capitalize text-zinc-700 dark:text-zinc-300">{c.lead_source || 'manual'}</span>
                          </div>
                          <div className="flex justify-between text-zinc-500">
                            <span>à¤…à¤¨à¥à¤®à¤¾à¤¨à¤¿à¤¤ à¤®à¥‚à¤²à¥à¤¯:</span>
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">â‚¹{(c.lead_value || 0).toLocaleString()}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 mt-4 pt-3 border-t border-zinc-100 dark:border-zinc-800/50">
                    <button
                      onClick={() => initiateWhatsAppChat(c.id)}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                    >
                      <Send className="w-3.5 h-3.5" /> WhatsApp à¤šà¥ˆà¤Ÿ
                    </button>
                    <button
                      onClick={() => openEditModal(c)}
                      className="p-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl text-zinc-600 dark:text-zinc-400 transition-all"
                      title="Edit Contact"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteContact(c.id)}
                      className="p-2 border border-zinc-200 dark:border-zinc-800 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600 rounded-xl text-zinc-600 dark:text-zinc-400 transition-all"
                      title="Delete Contact"
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
                <div key={stage.key} className="bg-zinc-100/50 dark:bg-zinc-900/40 border border-zinc-200/50 dark:border-zinc-800/40 rounded-2xl p-4 flex flex-col min-h-[500px]">
                  {/* Stage Header */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold text-xs text-zinc-700 dark:text-zinc-300">{stage.label}</span>
                      <span className="bg-zinc-200 dark:bg-zinc-800 text-[10px] text-zinc-600 dark:text-zinc-400 px-2 py-0.5 rounded-full font-bold">{count}</span>
                    </div>
                    <div className="text-[11px] text-zinc-500 flex items-center gap-1 font-mono">
                      <Coins className="w-3 h-3 text-amber-500" /> Value: â‚¹{totalValue.toLocaleString()}
                    </div>
                  </div>

                  {/* Stage Lead Cards */}
                  <div className="flex-1 space-y-3 overflow-y-auto">
                    {stageLeads.length === 0 ? (
                      <div className="text-center py-8 text-[11px] text-zinc-400 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                        à¤•à¥‹à¤ˆ à¤²à¥€à¤¡ à¤¨à¤¹à¥€à¤‚
                      </div>
                    ) : (
                      stageLeads.map(lead => (
                        <div key={lead.id} className="bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl p-3 shadow-xs hover:shadow-md transition-all space-y-2">
                          <div>
                            <h4 className="font-medium text-xs text-zinc-900 dark:text-zinc-100 truncate">{lead.name}</h4>
                            <span className="text-[10px] text-zinc-500">{lead.phone || lead.platform_contact_id}</span>
                          </div>

                          <div className="flex justify-between items-center text-[10px] text-zinc-500">
                            <span className="bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded capitalize">{lead.lead_source || 'manual'}</span>
                            <span className="font-bold text-zinc-700 dark:text-zinc-300">â‚¹{(lead.lead_value || 0).toLocaleString()}</span>
                          </div>

                          {/* Fast Action Buttons */}
                          <div className="flex gap-1.5 pt-2 border-t border-zinc-100 dark:border-zinc-800/50">
                            <button
                              onClick={() => initiateWhatsAppChat(lead.id)}
                              className="flex-1 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/20 dark:hover:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] py-1 rounded-md font-bold flex items-center justify-center gap-1 transition-all"
                            >
                              <Send className="w-2.5 h-2.5" /> à¤šà¥ˆà¤Ÿ
                            </button>
                            <button
                              onClick={() => openEditModal(lead)}
                              className="p-1 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-md text-zinc-600 dark:text-zinc-400 transition-all"
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
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-lg overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center bg-zinc-50 dark:bg-zinc-900/50">
              <h2 className="font-bold text-zinc-950 dark:text-white text-base">
                {isEdit ? "à¤¸à¤‚à¤ªà¤°à¥à¤• à¤¸à¤‚à¤ªà¤¾à¤¦à¤¿à¤¤ à¤•à¤°à¥‡à¤‚ (Edit Contact)" : "à¤¨à¤¯à¤¾ à¤¸à¤‚à¤ªà¤°à¥à¤• à¤œà¥‹à¥œà¥‡à¤‚ (Add New Contact)"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={saveContact} className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Name */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">à¤ªà¥‚à¤°à¤¾ à¤¨à¤¾à¤® (Full Name) *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="à¤‰à¤¦à¤¾. à¤°à¤¾à¤¹à¥à¤² à¤¶à¤°à¥à¤®à¤¾"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Primary Phone */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">à¤®à¥à¤–à¥à¤¯ à¤«à¤¼à¥‹à¤¨ à¤¨à¤‚à¤¬à¤° (Phone) *</label>
                  <PhoneInput
                    international
                    defaultCountry="IN"
                    required
                    value={formPhone}
                    onChange={(val) => setFormPhone(val || '')}
                    placeholder="à¤«à¤¼à¥‹à¤¨ à¤¨à¤‚à¤¬à¤° à¤¦à¤°à¥à¤œ à¤•à¤°à¥‡à¤‚"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Additional Phone */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">à¤…à¤¤à¤¿à¤°à¤¿à¤•à¥à¤¤ à¤«à¤¼à¥‹à¤¨ à¤¨à¤‚à¤¬à¤°</label>
                  <PhoneInput
                    international
                    defaultCountry="IN"
                    value={formAdditionalPhone}
                    onChange={(val) => setFormAdditionalPhone(val || '')}
                    placeholder="à¤…à¤¤à¤¿à¤°à¤¿à¤•à¥à¤¤ à¤¨à¤‚à¤¬à¤° à¤¦à¤°à¥à¤œ à¤•à¤°à¥‡à¤‚"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">à¤ˆà¤®à¥‡à¤² (Email)</label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    placeholder="à¤‰à¤¦à¤¾. rahul@example.com"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Gender */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">à¤²à¤¿à¤‚à¤— (Gender)</label>
                  <select
                    value={formGender}
                    onChange={(e) => setFormGender(e.target.value)}
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  >
                    <option value="Male">à¤ªà¥à¤°à¥à¤· (Male)</option>
                    <option value="Female">à¤®à¤¹à¤¿à¤²à¤¾ (Female)</option>
                    <option value="Other">à¤…à¤¨à¥à¤¯ (Other)</option>
                  </select>
                </div>

                {/* Instagram */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">à¤‡à¤‚à¤¸à¥à¤Ÿà¤¾à¤—à¥à¤°à¤¾à¤® à¤¯à¥‚à¤œà¤°à¤¨à¥‡à¤®</label>
                  <input
                    type="text"
                    value={formInstagram}
                    onChange={(e) => setFormInstagram(e.target.value)}
                    placeholder="à¤‰à¤¦à¤¾. rahul_sharma"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Facebook */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">à¤«à¥‡à¤¸à¤¬à¥à¤• à¤¯à¥‚à¤œà¤°à¤¨à¥‡à¤®</label>
                  <input
                    type="text"
                    value={formFacebook}
                    onChange={(e) => setFormFacebook(e.target.value)}
                    placeholder="à¤‰à¤¦à¤¾. rahul.sharma.fb"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                {/* WhatsApp Username */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">à¤µà¥à¤¹à¤¾à¤Ÿà¥à¤¸à¤à¤ª à¤¯à¥‚à¤œà¤°à¤¨à¥‡à¤® / à¤‰à¤ªà¤¨à¤¾à¤®</label>
                  <input
                    type="text"
                    value={formWhatsApp}
                    onChange={(e) => setFormWhatsApp(e.target.value)}
                    placeholder="à¤‰à¤¦à¤¾. Rahul S"
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Notes */}
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-500 mb-1">à¤¨à¥‹à¤Ÿà¥à¤¸ / à¤Ÿà¤¿à¤ªà¥à¤ªà¤£à¤¿à¤¯à¤¾à¤‚</label>
                  <textarea
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="à¤¸à¤‚à¤ªà¤°à¥à¤• à¤•à¥‡ à¤¬à¤¾à¤°à¥‡ à¤®à¥‡à¤‚ à¤…à¤¤à¤¿à¤°à¤¿à¤•à¥à¤¤ à¤œà¤¾à¤¨à¤•à¤¾à¤°à¥€..."
                    className="w-full px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700/60 rounded-xl text-sm outline-none focus:border-indigo-500 h-20 resize-none"
                  />
                </div>

                {/* Is Lead Toggle */}
                <div className="sm:col-span-2 bg-zinc-50 dark:bg-zinc-800/20 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200">à¤•à¥à¤¯à¤¾ à¤¯à¤¹ à¤²à¥€à¤¡ à¤¹à¥ˆ? (Mark as Lead)</h4>
                    <p className="text-[10px] text-zinc-400">à¤²à¥€à¤¡ à¤•à¥‡ à¤°à¥‚à¤ª à¤®à¥‡à¤‚ à¤šà¤¿à¤¹à¥à¤¨à¤¿à¤¤ à¤•à¤°à¤¨à¥‡ à¤ªà¤° à¤†à¤ª à¤‡à¤¸à¥‡ à¤¸à¥‡à¤²à¥à¤¸ à¤«à¤¨à¤² à¤®à¥‡à¤‚ à¤Ÿà¥à¤°à¥ˆà¤• à¤•à¤° à¤ªà¤¾à¤à¤‚à¤—à¥‡à¥¤</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formIsLead}
                    onChange={(e) => setFormIsLead(e.target.checked)}
                    className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>

                {/* Lead fields displayed conditionally */}
                {formIsLead && (
                  <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-indigo-50/20 dark:bg-indigo-950/5 p-4 rounded-xl border border-indigo-100/50 dark:border-indigo-900/10">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">à¤²à¥€à¤¡ à¤¸à¥à¤Ÿà¥‡à¤Ÿà¤¸</label>
                      <select
                        value={formLeadStatus}
                        onChange={(e) => setFormLeadStatus(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none"
                      >
                        <option value="new">à¤¨à¤ˆ à¤²à¥€à¤¡ (New)</option>
                        <option value="contacted">à¤¸à¤‚à¤ªà¤°à¥à¤• à¤•à¤¿à¤¯à¤¾ (Contacted)</option>
                        <option value="qualified">à¤¯à¥‹à¤—à¥à¤¯ à¤²à¥€à¤¡ (Qualified)</option>
                        <option value="closed_won">à¤¸à¤«à¤² (Closed Won)</option>
                        <option value="closed_lost">à¤µà¤¿à¤«à¤² (Closed Lost)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">à¤²à¥€à¤¡ à¤¸à¥‹à¤°à¥à¤¸</label>
                      <select
                        value={formLeadSource}
                        onChange={(e) => setFormLeadSource(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none"
                      >
                        <option value="website">à¤µà¥‡à¤¬à¤¸à¤¾à¤‡à¤Ÿ (Website)</option>
                        <option value="facebook">à¤«à¥‡à¤¸à¤¬à¥à¤• (Facebook)</option>
                        <option value="instagram">à¤‡à¤‚à¤¸à¥à¤Ÿà¤¾à¤—à¥à¤°à¤¾à¤® (Instagram)</option>
                        <option value="whatsapp">à¤µà¥à¤¹à¤¾à¤Ÿà¥à¤¸à¤à¤ª (WhatsApp)</option>
                        <option value="referral">à¤°à¥‡à¤«à¤°à¤² (Referral)</option>
                        <option value="manual">à¤®à¥ˆà¤¨à¥à¤…à¤² (Manual)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-500 mb-1">à¤…à¤¨à¥à¤®à¤¾à¤¨à¤¿à¤¤ à¤®à¥‚à¤²à¥à¤¯ (Value â‚¹)</label>
                      <input
                        type="number"
                        value={formLeadValue}
                        onChange={(e) => setFormLeadValue(e.target.value)}
                        placeholder="à¤‰à¤¦à¤¾. 15000"
                        className="w-full px-3 py-2 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex gap-3">
                <button
                  type="submit"
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  {isEdit ? "à¤¬à¤¦à¤²à¤¾à¤µ à¤¸à¤¹à¥‡à¤œà¥‡à¤‚" : "à¤¸à¤‚à¤ªà¤°à¥à¤• à¤¸à¤¹à¥‡à¤œà¥‡à¤‚"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 transition-all"
                >
                  à¤°à¤¦à¥à¤¦ à¤•à¤°à¥‡à¤‚
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Export / Copy Modal */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-zinc-200 dark:border-zinc-800 animate-in fade-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">à¤à¤•à¥à¤¸à¤ªà¥‹à¤°à¥à¤Ÿ / à¤•à¥‰à¤ªà¥€ à¤•à¤°à¥‡à¤‚</h2>
              <p className="text-xs text-zinc-500 mt-1">{selectedContactIds.size} à¤¸à¤‚à¤ªà¤°à¥à¤• à¤šà¥à¤¨à¥‡ à¤—à¤</p>
            </div>
            
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-2">à¤•à¥‰à¤ªà¥€ à¤«à¥‰à¤°à¤®à¥ˆà¤Ÿ (Format)</label>
                <div className="flex gap-2 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
                  <button 
                    onClick={() => setCopyFormat('newline')}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${copyFormat === 'newline' ? 'bg-white dark:bg-zinc-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 hover:text-zinc-700'}`}
                  >
                    à¤²à¤¾à¤‡à¤¨-à¤¬à¤¾à¤¯-à¤²à¤¾à¤‡à¤¨
                  </button>
                  <button 
                    onClick={() => setCopyFormat('comma')}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-all ${copyFormat === 'comma' ? 'bg-white dark:bg-zinc-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-zinc-500 hover:text-zinc-700'}`}
                  >
                    à¤•à¥Œà¤®à¤¾ (Comma)
                  </button>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  onClick={() => {
                    const selected = filteredContacts.filter(c => selectedContactIds.has(c.id));
                    const values = selected.map(c => c.phone).filter(v => !!v);
                    if (!values.length) { alert('à¤•à¥‹à¤ˆ à¤«à¤¼à¥‹à¤¨ à¤¨à¤‚à¤¬à¤° à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤'); return; }
                    navigator.clipboard.writeText(values.join(copyFormat === 'comma' ? ', ' : '\\n')).then(() => {
                      toast('success', `${values.length} à¤¨à¤‚à¤¬à¤° à¤•à¥à¤²à¤¿à¤ªà¤¬à¥‹à¤°à¥à¤¡ à¤®à¥‡à¤‚ à¤•à¥‰à¤ªà¥€ à¤¹à¥‹ à¤—à¤à¥¤`);
                      setExportModalOpen(false);
                    });
                  }}
                  className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 text-sm font-semibold rounded-xl transition-colors text-left px-4 flex items-center justify-between"
                >
                  <span>à¤¸à¤¿à¤°à¥à¤« à¤«à¤¼à¥‹à¤¨ à¤¨à¤‚à¤¬à¤° à¤•à¥‰à¤ªà¥€ à¤•à¤°à¥‡à¤‚</span>
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    const selected = filteredContacts.filter(c => selectedContactIds.has(c.id));
                    const values = selected.map(c => c.email).filter(v => !!v);
                    if (!values.length) { alert('à¤•à¥‹à¤ˆ à¤ˆà¤®à¥‡à¤² à¤¨à¤¹à¥€à¤‚ à¤®à¤¿à¤²à¤¾à¥¤'); return; }
                    navigator.clipboard.writeText(values.join(copyFormat === 'comma' ? ', ' : '\\n')).then(() => {
                      toast('success', `${values.length} à¤ˆà¤®à¥‡à¤² à¤•à¥à¤²à¤¿à¤ªà¤¬à¥‹à¤°à¥à¤¡ à¤®à¥‡à¤‚ à¤•à¥‰à¤ªà¥€ à¤¹à¥‹ à¤—à¤à¥¤`);
                      setExportModalOpen(false);
                    });
                  }}
                  className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-400 text-sm font-semibold rounded-xl transition-colors text-left px-4 flex items-center justify-between"
                >
                  <span>à¤¸à¤¿à¤°à¥à¤« à¤ˆà¤®à¥‡à¤² à¤•à¥‰à¤ªà¥€ à¤•à¤°à¥‡à¤‚</span>
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
                  className="w-full py-2.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm font-semibold rounded-xl transition-colors text-left px-4 flex items-center justify-between"
                >
                  <span>CSV à¤®à¥‡à¤‚ à¤à¤•à¥à¤¸à¤ªà¥‹à¤°à¥à¤Ÿ à¤•à¤°à¥‡à¤‚</span>
                  <Download className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
              <button
                onClick={() => setExportModalOpen(false)}
                className="w-full py-2.5 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 text-sm font-semibold rounded-xl transition-colors shadow-sm"
              >
                à¤¬à¤‚à¤¦ à¤•à¤°à¥‡à¤‚
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

