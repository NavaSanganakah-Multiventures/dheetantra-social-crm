import '../models/models.dart';

final List<Contact> mockContacts = [
  Contact(
    id: 'c1',
    name: 'राहुल शर्मा',
    phone: '+91 98765 43210',
    tags: ['लीड', 'हॉट'],
    isLead: true,
    lastActive: DateTime.now().subtract(const Duration(minutes: 5)),
  ),
  Contact(
    id: 'c2',
    name: 'Priya Verma',
    phone: '+91 98123 45678',
    tags: ['ग्राहक'],
    lastActive: DateTime.now().subtract(const Duration(minutes: 32)),
  ),
  Contact(
    id: 'c3',
    name: 'Amit Kumar',
    phone: '+91 99887 76655',
    tags: ['लीड'],
    isLead: true,
    lastActive: DateTime.now().subtract(const Duration(hours: 2)),
  ),
  Contact(
    id: 'c4',
    name: 'सुनीता देवी',
    phone: '+91 91234 56789',
    tags: ['ग्राहक', 'VIP'],
    lastActive: DateTime.now().subtract(const Duration(hours: 5)),
  ),
  Contact(
    id: 'c5',
    name: 'Vikram Singh',
    phone: '+91 90012 34567',
    tags: ['पार्टनर'],
    lastActive: DateTime.now().subtract(const Duration(days: 1)),
  ),
  Contact(
    id: 'c6',
    name: 'Neha Gupta',
    phone: '+91 87654 32109',
    tags: ['लीड'],
    isLead: true,
    lastActive: DateTime.now().subtract(const Duration(days: 2)),
  ),
];

final List<Conversation> mockConversations = [
  Conversation(
    contact: mockContacts[0],
    unreadCount: 2,
    isActive: true,
    messages: [
      Message(
        id: 'm1',
        text: 'नमस्ते, क्या आप कल उपलब्ध होंगे?',
        time: DateTime.now().subtract(const Duration(minutes: 45)),
        isMine: false,
        isRead: true,
      ),
      Message(
        id: 'm2',
        text: 'हाँ, कल दोपहर बाद ठीक रहेगा',
        time: DateTime.now().subtract(const Duration(minutes: 40)),
        isMine: true,
        isRead: true,
      ),
      Message(
        id: 'm3',
        text: 'परफेक्ट, मैं 3 बजे कॉल करूँगा 🙏',
        time: DateTime.now().subtract(const Duration(minutes: 8)),
        isMine: false,
      ),
      Message(
        id: 'm4',
        text: 'नमस्ते, कल कॉल करूँगा',
        time: DateTime.now().subtract(const Duration(minutes: 5)),
        isMine: false,
      ),
    ],
  ),
  Conversation(
    contact: mockContacts[1],
    unreadCount: 0,
    messages: [
      Message(
        id: 'm5',
        text: 'बिल भेज दीजिए pls',
        time: DateTime.now().subtract(const Duration(minutes: 32)),
        isMine: false,
        isRead: true,
      ),
      Message(
        id: 'm6',
        text: 'जी, तुरंत भेज रहा हूँ',
        time: DateTime.now().subtract(const Duration(minutes: 30)),
        isMine: true,
        isRead: true,
      ),
    ],
  ),
  Conversation(
    contact: mockContacts[2],
    unreadCount: 1,
    isActive: true,
    messages: [
      Message(
        id: 'm7',
        text: 'मुझे डेमो चाहिए',
        time: DateTime.now().subtract(const Duration(hours: 2)),
        isMine: false,
      ),
    ],
  ),
  Conversation(
    contact: mockContacts[3],
    unreadCount: 0,
    messages: [
      Message(
        id: 'm8',
        text: 'धन्यवाद!',
        time: DateTime.now().subtract(const Duration(hours: 5)),
        isMine: false,
        isRead: true,
      ),
    ],
  ),
  Conversation(
    contact: mockContacts[4],
    unreadCount: 0,
    messages: [
      Message(
        id: 'm9',
        text: 'चलो शाम को मिलते हैं',
        time: DateTime.now().subtract(const Duration(days: 1)),
        isMine: true,
        isRead: true,
      ),
    ],
  ),
];

final List<ScheduledPost> mockScheduledPosts = [
  ScheduledPost(
    id: 'p1',
    title: 'नए ऑफर की घोषणा - फ्लैट 20% छूट',
    channel: 'WhatsApp',
    channelIcon: 'whatsapp',
    scheduledAt: DateTime.now().add(const Duration(hours: 3)),
    audience: 'सभी संपर्क (1,240)',
  ),
  ScheduledPost(
    id: 'p2',
    title: 'दिवाली स्पेशल ग्रीटिंग्स',
    channel: 'WhatsApp',
    channelIcon: 'whatsapp',
    scheduledAt: DateTime.now().add(const Duration(days: 1, hours: 6)),
    audience: 'VIP ग्राहक (86)',
  ),
  ScheduledPost(
    id: 'p3',
    title: 'मासिक न्यूज़लेटर - अगस्त 2026',
    channel: 'Email',
    channelIcon: 'email',
    scheduledAt: DateTime.now().add(const Duration(days: 3)),
    audience: 'न्यूज़लेटर सब्सक्राइबर्स (2,050)',
  ),
];

final List<CallLog> mockCallLogs = [
  CallLog(
    contactId: mockContacts[0].id,
    name: mockContacts[0].name,
    phone: mockContacts[0].phone,
    direction: 'incoming',
    status: 'connected',
    time: DateTime.now().subtract(const Duration(hours: 1)),
    durationSeconds: 245,
  ),
  CallLog(
    contactId: mockContacts[1].id,
    name: mockContacts[1].name,
    phone: mockContacts[1].phone,
    direction: 'outgoing',
    status: 'connected',
    time: DateTime.now().subtract(const Duration(hours: 4)),
    durationSeconds: 92,
  ),
  CallLog(
    contactId: mockContacts[2].id,
    name: mockContacts[2].name,
    phone: mockContacts[2].phone,
    direction: 'incoming',
    status: 'missed',
    time: DateTime.now().subtract(const Duration(hours: 6)),
  ),
  CallLog(
    contactId: mockContacts[3].id,
    name: mockContacts[3].name,
    phone: mockContacts[3].phone,
    direction: 'outgoing',
    status: 'declined',
    time: DateTime.now().subtract(const Duration(days: 1)),
  ),
  CallLog(
    contactId: mockContacts[4].id,
    name: mockContacts[4].name,
    phone: mockContacts[4].phone,
    direction: 'incoming',
    status: 'connected',
    time: DateTime.now().subtract(const Duration(days: 2)),
    durationSeconds: 610,
  ),
];

final List<Broadcast> mockBroadcasts = [
  Broadcast(
    id: 'b1',
    message: 'प्रिय ग्राहकों, हमारे नए सीज़न की सेल शुरू हो गई है! 🎉 20% तक की छूट।',
    recipients: 1240,
    delivered: 1187,
    sentAt: DateTime.now().subtract(const Duration(hours: 6)),
    channel: 'WhatsApp',
  ),
  Broadcast(
    id: 'b2',
    message: 'आपका मासिक बिल ₹2,499 तैयार है। कृपया जल्द से जल्द भुगतान करें।',
    recipients: 86,
    delivered: 84,
    sentAt: DateTime.now().subtract(const Duration(days: 2)),
    channel: 'WhatsApp',
  ),
  Broadcast(
    id: 'b3',
    message: 'ग्राहक संतुष्टि सर्वेक्षण - आपका फीडबैक हमारे लिए महत्वपूर्ण है!',
    recipients: 2050,
    delivered: 1903,
    sentAt: DateTime.now().subtract(const Duration(days: 5)),
    channel: 'Email',
  ),
];
