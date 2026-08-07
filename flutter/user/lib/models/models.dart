import 'dart:convert';

DateTime? _parseUtcDateTime(dynamic value) {
  if (value == null || value.toString().trim().isEmpty) return null;
  String s = value.toString().trim();
  if (!s.endsWith('Z') && !s.contains('+')) {
    if (s.contains(' ')) {
      s = s.replaceFirst(' ', 'T');
    }
    s = '${s}Z';
  }
  return DateTime.tryParse(s)?.toLocal();
}

class Contact {
  final String id;
  final String name;
  final String phone;
  final List<String> tags;
  final bool isLead;
  final DateTime? lastActive;
  final String? email;
  final String? notes;
  final String? gender;
  final String? leadStatus;
  final String? leadSource;
  final String? platform;

  const Contact({
    required this.id,
    required this.name,
    required this.phone,
    this.tags = const [],
    this.isLead = false,
    this.lastActive,
    this.email,
    this.notes,
    this.gender,
    this.leadStatus,
    this.leadSource,
    this.platform,
  });

  factory Contact.fromJson(Map<String, dynamic> json) {
    return Contact(
      id: json['id'] ?? '',
      name: json['name'] ?? json['contact_name'] ?? 'Unknown',
      phone: json['phone'] ?? json['platform_contact_id'] ?? '',
      tags: _parseTags(json),
      isLead: json['is_lead'] == 1 || json['is_lead'] == true,
      lastActive: _parseDateTime(json['updated_at'] ?? json['created_at']),
      email: json['email'],
      notes: json['notes'],
      gender: json['gender'],
      leadStatus: json['lead_status'],
      leadSource: json['lead_source'],
      platform: json['platform'],
    );
  }

  static List<String> _parseTags(Map<String, dynamic> json) {
    final tags = <String>[];
    if (json['is_lead'] == 1 || json['is_lead'] == true) {
      tags.add('लीड');
      if (json['lead_status'] != null && json['lead_status'] != 'new') {
        tags.add(json['lead_status']);
      }
    } else {
      tags.add('ग्राहक');
    }
    return tags;
  }

  static DateTime? _parseDateTime(dynamic value) {
    if (value == null) return null;
    if (value is String) {
      return _parseUtcDateTime(value);
    }
    return null;
  }
}

class Message {
  final String id;
  final String text;
  final DateTime time;
  final bool isMine;
  final bool isRead;
  final String? senderType;
  final String status;
  final String? subject;
  final String? html;

  const Message({
    required this.id,
    required this.text,
    required this.time,
    required this.isMine,
    this.isRead = false,
    this.senderType,
    this.status = 'sent',
    this.subject,
    this.html,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    final senderType = json['sender_type'] ?? 'customer';
    String textContent = json['content'] ?? json['text'] ?? '';
    String? subject;
    String? html;

    // Parse email payload if present in media_url
    if (json['media_url'] != null) {
      try {
        final parsed = jsonDecode(json['media_url']);
        if (parsed is Map) {
          if (parsed['subject'] != null) subject = parsed['subject'];
          if (parsed['text'] != null) textContent = parsed['text'];
          if (parsed['html'] != null) html = parsed['html'];
        }
      } catch (_) {
        // Not a JSON string
      }
    }

    return Message(
      id: json['id'] ?? '',
      text: textContent,
      time: _parseUtcDateTime(json['created_at']) ?? DateTime.now(),
      isMine: senderType == 'agent' || senderType == 'system',
      isRead: json['status'] == 'read',
      senderType: senderType,
      status: json['status'] ?? 'sent',
      subject: subject,
      html: html,
    );
  }

  Message copyWith({
    String? id,
    String? text,
    DateTime? time,
    bool? isMine,
    bool? isRead,
    String? senderType,
    String? status,
    String? subject,
    String? html,
  }) {
    return Message(
      id: id ?? this.id,
      text: text ?? this.text,
      time: time ?? this.time,
      isMine: isMine ?? this.isMine,
      isRead: isRead ?? this.isRead,
      senderType: senderType ?? this.senderType,
      status: status ?? this.status,
      subject: subject ?? this.subject,
      html: html ?? this.html,
    );
  }
}

class Conversation {
  final String id;
  final Contact contact;
  final List<Message> messages;
  final int unreadCount;
  final bool isActive;
  final String? lastMessageText;
  final DateTime? updatedAt;
  final String? status;
  final String? aiLabel;
  final String? aiSummary;
  final String? phoneNumberId;
  final String platform;

  const Conversation({
    this.id = '',
    required this.contact,
    required this.messages,
    this.unreadCount = 0,
    this.isActive = false,
    this.lastMessageText,
    this.updatedAt,
    this.status,
    this.aiLabel,
    this.aiSummary,
    this.phoneNumberId,
    this.platform = 'whatsapp',
  });

  String get lastMessage => lastMessageText ?? (messages.isEmpty ? '' : messages.last.text);
  DateTime get lastTime => updatedAt ?? (messages.isEmpty ? DateTime.now() : messages.last.time);

  factory Conversation.fromJson(Map<String, dynamic> json) {
    return Conversation(
      id: json['id'] ?? '',
      contact: Contact(
        id: json['contact_id'] ?? '',
        name: json['contact_name'] ?? 'Unknown',
        phone: json['phone'] ?? '',
      ),
      messages: const [],
      unreadCount: 0,
      isActive: json['status'] == 'open',
      lastMessageText: json['last_message'],
      updatedAt: _parseUtcDateTime(json['updated_at'] ?? json['customer_last_message_at']),
      status: json['status'],
      aiLabel: json['ai_label'],
      aiSummary: json['ai_summary'],
      phoneNumberId: json['phone_number_id'],
      platform: json['platform'] ?? 'whatsapp',
    );
  }
}

class ScheduledPost {
  final String id;
  final String title;
  final String channel;
  final String channelIcon;
  final DateTime scheduledAt;
  final String audience;

  const ScheduledPost({
    required this.id,
    required this.title,
    required this.channel,
    required this.channelIcon,
    required this.scheduledAt,
    required this.audience,
  });

  factory ScheduledPost.fromJson(Map<String, dynamic> json) {
    return ScheduledPost(
      id: json['id'] ?? '',
      title: json['title'] ?? json['message'] ?? '',
      channel: json['channel'] ?? 'WhatsApp',
      channelIcon: (json['channel'] ?? 'WhatsApp').toString().toLowerCase() == 'email' ? 'email' : 'whatsapp',
      scheduledAt: _parseUtcDateTime(json['scheduled_at']) ?? DateTime.now(),
      audience: json['audience'] ?? '',
    );
  }
}

class CallLog {
  final String contactId;
  final String name;
  final String phone;
  final String direction;
  final String status;
  final DateTime time;
  final int durationSeconds;

  const CallLog({
    required this.contactId,
    required this.name,
    required this.phone,
    required this.direction,
    required this.status,
    required this.time,
    this.durationSeconds = 0,
  });

  factory CallLog.fromJson(Map<String, dynamic> json) {
    return CallLog(
      contactId: json['contact_id'] ?? json['contactId'] ?? '',
      name: json['contact_name'] ?? json['name'] ?? 'Unknown',
      phone: json['phone'] ?? json['from_number'] ?? json['to_number'] ?? '',
      direction: json['direction'] ?? 'incoming',
      status: json['status'] ?? 'unknown',
      time: _parseUtcDateTime(json['created_at'] ?? json['time']) ?? DateTime.now(),
      durationSeconds: json['duration_seconds'] ?? json['durationSeconds'] ?? 0,
    );
  }
}

class Broadcast {
  final String id;
  final String message;
  final int recipients;
  final int delivered;
  final DateTime sentAt;
  final String channel;

  const Broadcast({
    required this.id,
    required this.message,
    required this.recipients,
    required this.delivered,
    required this.sentAt,
    required this.channel,
  });

  factory Broadcast.fromJson(Map<String, dynamic> json) {
    return Broadcast(
      id: json['id'] ?? '',
      message: json['message'] ?? json['content'] ?? '',
      recipients: json['recipients'] ?? json['total_recipients'] ?? 0,
      delivered: json['delivered'] ?? json['delivered_count'] ?? 0,
      sentAt: _parseUtcDateTime(json['sent_at'] ?? json['created_at']) ?? DateTime.now(),
      channel: json['channel'] ?? 'WhatsApp',
    );
  }
}
