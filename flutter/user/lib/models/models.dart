class Contact {
  final String id;
  final String name;
  final String phone;
  final List<String> tags;
  final bool isLead;
  final DateTime? lastActive;

  const Contact({
    required this.id,
    required this.name,
    required this.phone,
    this.tags = const [],
    this.isLead = false,
    this.lastActive,
  });
}

class Message {
  final String id;
  final String text;
  final DateTime time;
  final bool isMine;
  final bool isRead;

  const Message({
    required this.id,
    required this.text,
    required this.time,
    required this.isMine,
    this.isRead = false,
  });
}

class Conversation {
  final Contact contact;
  final List<Message> messages;
  final int unreadCount;
  final bool isActive;

  const Conversation({
    required this.contact,
    required this.messages,
    this.unreadCount = 0,
    this.isActive = false,
  });

  String get lastMessage => messages.isEmpty ? '' : messages.last.text;
  DateTime get lastTime => messages.isEmpty ? DateTime.now() : messages.last.time;
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
}
