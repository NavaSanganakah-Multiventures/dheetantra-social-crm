import 'dart:convert';

/// Backend se aaye strings me kabhi kabhi invalid UTF-16 surrogate pairs aa
/// jaate hain (jaise half emoji ya corrupted bytes). Unko render karne par
/// Flutter crash karta hai. Is function se unhe safely remove kar dete hain.
String _safeString(dynamic value) {
  if (value == null) return '';
  final input = value.toString();
  final units = input.codeUnits;
  final buffer = StringBuffer();
  for (var i = 0; i < units.length; i++) {
    final c = units[i];
    // High surrogate
    if (c >= 0xD800 && c <= 0xDBFF) {
      if (i + 1 < units.length) {
        final next = units[i + 1];
        if (next >= 0xDC00 && next <= 0xDFFF) {
          buffer.write(String.fromCharCodes(<int>[c, next]));
          i++;
          continue;
        }
      }
      // Lone high surrogate — skip.
    } else if (c >= 0xDC00 && c <= 0xDFFF) {
      // Lone low surrogate — skip.
    } else {
      buffer.write(String.fromCharCode(c));
    }
  }
  return buffer.toString();
}

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
      id: _safeString(json['id']),
      name: _safeString(json['name'] ?? json['contact_name']).isEmpty
          ? 'Unknown'
          : _safeString(json['name'] ?? json['contact_name']),
      phone: _safeString(json['phone'] ?? json['platform_contact_id']),
      tags: _parseTags(json),
      isLead: json['is_lead'] == 1 || json['is_lead'] == true,
      lastActive: _parseDateTime(json['updated_at'] ?? json['created_at']),
      email: _safeString(json['email']),
      notes: _safeString(json['notes']),
      gender: _safeString(json['gender']),
      leadStatus: _safeString(json['lead_status']),
      leadSource: _safeString(json['lead_source']),
      platform: _safeString(json['platform']),
    );
  }

  static List<String> _parseTags(Map<String, dynamic> json) {
    final tags = <String>[];
    if (json['is_lead'] == 1 || json['is_lead'] == true) {
      tags.add('Lead');
      if (json['lead_status'] != null && json['lead_status'] != 'new') {
        tags.add(_safeString(json['lead_status']));
      }
    } else {
      tags.add('Customer');
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
  final String? platform;
  final String? messageType;
  final String? mediaUrl;

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
    this.platform,
    this.messageType,
    this.mediaUrl,
  });

  factory Message.fromJson(Map<String, dynamic> json) {
    final senderType = _safeString(json['sender_type'] ?? 'customer');
    final messageType = _safeString(json['message_type'] ?? 'text');
    String textContent = _safeString(json['content'] ?? json['text']);
    String? subject;
    String? html;

    // Keep the raw media_url (R2 path / Graph URL / JSON payload) so the
    // chat bubble can render the media inline.
    String? mediaUrl = json['media_url'] != null ? _safeString(json['media_url']) : null;

    // Parse email / structured WhatsApp payload if present in media_url
    if (mediaUrl != null) {
      try {
        final parsed = jsonDecode(mediaUrl);
        if (parsed is Map) {
          if (messageType == 'email') {
            if (parsed['subject'] != null) subject = _safeString(parsed['subject']);
            if (parsed['text'] != null) textContent = _safeString(parsed['text']);
            if (parsed['html'] != null) html = _safeString(parsed['html']);
          } else if (messageType == 'interactive') {
            final buttonTitle = parsed['button_title'];
            final listTitle = parsed['list_title'];
            final listDesc = parsed['list_description'];
            if (buttonTitle != null) textContent = _safeString(buttonTitle);
            if (listTitle != null) {
              textContent = listTitle.toString();
              if (listDesc != null) textContent += '\n' + listDesc.toString();
            }
            final nfm = parsed['nfm_response'] as Map?;
            if (nfm != null && nfm['name'] != null) {
              textContent = 'Flow: ' + _safeString(nfm['name']);
            }
          } else if (messageType == 'order') {
            final order = parsed['order'] as Map?;
            if (order != null && order['text'] != null) {
              textContent = _safeString(order['text']);
            }
          } else if (messageType == 'location') {
            final name = parsed['name'];
            final address = parsed['address'];
            if (name != null) textContent = _safeString(name);
            if (address != null) textContent += '\n' + _safeString(address);
          } else if (messageType == 'unsupported') {
            final err = (parsed['errors'] as List?)?.firstOrNull as Map?;
            if (err != null && err['title'] != null) {
              textContent = _safeString(err['title']);
            }
          }
        }
      } catch (_) {
        // Not a JSON string
      }
    }

    return Message(
      id: _safeString(json['id']),
      text: textContent,
      time: _parseUtcDateTime(json['created_at']) ?? DateTime.now(),
      isMine: senderType == 'agent' || senderType == 'system' || senderType == 'bot',
      isRead: json['status'] == 'read',
      senderType: senderType,
      status: _safeString(json['status'] ?? 'sent'),
      subject: subject,
      html: html,
      platform: _safeString(json['platform'] ?? json['source']),
      messageType: messageType,
      mediaUrl: mediaUrl,
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
    String? platform,
    String? messageType,
    String? mediaUrl,
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
      platform: platform ?? this.platform,
      messageType: messageType ?? this.messageType,
      mediaUrl: mediaUrl ?? this.mediaUrl,
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
      id: _safeString(json['id']),
      contact: Contact(
        id: _safeString(json['contact_id']),
        name: _safeString(json['contact_name']).isEmpty
            ? 'Unknown'
            : _safeString(json['contact_name']),
        phone: _safeString(json['phone']),
      ),
      messages: const [],
      unreadCount: 0,
      isActive: json['status'] == 'open',
      lastMessageText: _safeString(json['last_message']),
      updatedAt: _parseUtcDateTime(json['updated_at'] ?? json['customer_last_message_at']),
      status: _safeString(json['status']),
      aiLabel: _safeString(json['ai_label']),
      aiSummary: _safeString(json['ai_summary']),
      phoneNumberId: _safeString(json['phone_number_id']),
      platform: _safeString(json['platform'] ?? 'whatsapp'),
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
      id: _safeString(json['id']),
      title: _safeString(json['title'] ?? json['message']),
      channel: _safeString(json['channel'] ?? 'WhatsApp'),
      channelIcon: _safeString(json['channel'] ?? 'WhatsApp').toLowerCase() == 'email' ? 'email' : 'whatsapp',
      scheduledAt: _parseUtcDateTime(json['scheduled_at']) ?? DateTime.now(),
      audience: _safeString(json['audience']),
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
      contactId: _safeString(json['contact_id'] ?? json['contactId']),
      name: _safeString(json['contact_name'] ?? json['name']).isEmpty
          ? 'Unknown'
          : _safeString(json['contact_name'] ?? json['name']),
      phone: _safeString(json['phone'] ?? json['from_number'] ?? json['to_number']),
      direction: _safeString(json['direction'] ?? 'incoming'),
      status: _safeString(json['status'] ?? 'unknown'),
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
      id: _safeString(json['id']),
      message: _safeString(json['message'] ?? json['content']),
      recipients: json['recipients'] ?? json['total_recipients'] ?? 0,
      delivered: json['delivered'] ?? json['delivered_count'] ?? 0,
      sentAt: _parseUtcDateTime(json['sent_at'] ?? json['created_at']) ?? DateTime.now(),
      channel: _safeString(json['channel'] ?? 'WhatsApp'),
    );
  }
}

class WorkspaceMember {
  final String id;
  final String email;
  final String? name;
  final String role;
  final DateTime? joinedAt;

  const WorkspaceMember({
    required this.id,
    required this.email,
    this.name,
    required this.role,
    this.joinedAt,
  });

  factory WorkspaceMember.fromJson(Map<String, dynamic> json) {
    return WorkspaceMember(
      id: _safeString(json['id'] ?? json['user_id']),
      email: _safeString(json['email']),
      name: _safeString(json['name']),
      role: _safeString(json['role'] ?? 'member'),
      joinedAt: _parseUtcDateTime(json['joined_at']),
    );
  }
}

class WhatsAppConfig {
  final String id;
  final String phoneNumberId;
  final String? wabaId;
  final String? accessToken;
  final String? verifyToken;
  final String replyMode;
  final bool callingEnabled;
  final String? aiProvider;
  final String? aiVoiceInstructions;
  final String about;
  final String description;
  final String website;
  final String email;
  final String address;
  final String username;
  final String? profilePictureUrl;

  const WhatsAppConfig({
    required this.id,
    required this.phoneNumberId,
    this.wabaId,
    this.accessToken,
    this.verifyToken,
    this.replyMode = 'manual',
    this.callingEnabled = true,
    this.aiProvider,
    this.aiVoiceInstructions,
    this.about = '',
    this.description = '',
    this.website = '',
    this.email = '',
    this.address = '',
    this.username = '',
    this.profilePictureUrl,
  });

  factory WhatsAppConfig.fromJson(Map<String, dynamic> json) {
    return WhatsAppConfig(
      id: _safeString(json['id']),
      phoneNumberId: _safeString(json['phone_number_id']),
      wabaId: _safeString(json['waba_id']),
      accessToken: json['access_token'] != null ? _safeString(json['access_token']) : null,
      verifyToken: _safeString(json['verify_token']),
      replyMode: _safeString(json['reply_mode'] ?? 'manual'),
      callingEnabled: json['calling_enabled'] == 1 || json['calling_enabled'] == true,
      aiProvider: _safeString(json['ai_provider']),
      aiVoiceInstructions: _safeString(json['ai_voice_instructions']),
      about: _safeString(json['about']),
      description: _safeString(json['description']),
      website: _safeString(json['website']),
      email: _safeString(json['email']),
      address: _safeString(json['address']),
      username: _safeString(json['username']),
      profilePictureUrl: _safeString(json['profile_picture_url']),
    );
  }

  Map<String, dynamic> toJson({String? accessTokenOverride, bool includeToken = true}) {
    return {
      if (id.isNotEmpty) 'id': id,
      'phone_number_id': phoneNumberId,
      if (wabaId != null && wabaId!.isNotEmpty) 'waba_id': wabaId,
      if (includeToken && (accessTokenOverride ?? accessToken) != null)
        'access_token': accessTokenOverride ?? accessToken,
      if (verifyToken != null && verifyToken!.isNotEmpty) 'verify_token': verifyToken,
      'reply_mode': replyMode,
      'calling_enabled': callingEnabled ? 1 : 0,
      if (aiProvider != null && aiProvider!.isNotEmpty) 'ai_provider': aiProvider,
      if (aiVoiceInstructions != null && aiVoiceInstructions!.isNotEmpty)
        'ai_voice_instructions': aiVoiceInstructions,
      'about': about,
      'description': description,
      'website': website,
      'email': email,
      'address': address,
      'username': username,
    };
  }
}

class EmailMailbox {
  final String id;
  final String emailAddress;
  final String? forwardTo;
  final bool isDefault;
  final String domainId;
  final String domainName;
  final String? domainStatus;

  const EmailMailbox({
    required this.id,
    required this.emailAddress,
    this.forwardTo,
    required this.isDefault,
    required this.domainId,
    required this.domainName,
    this.domainStatus,
  });

  factory EmailMailbox.fromJson(Map<String, dynamic> json) {
    return EmailMailbox(
      id: _safeString(json['id']),
      emailAddress: _safeString(json['email_address']),
      forwardTo: _safeString(json['forward_to']),
      isDefault: json['is_default'] == 1 || json['is_default'] == true,
      domainId: _safeString(json['domain_id']),
      domainName: _safeString(json['domain_name']),
      domainStatus: _safeString(json['domain_status']),
    );
  }
}


class Catalog {
  final String id;
  final String name;
  final String? description;
  final String status;
  final String? coverImageUrl;
  final int productsCount;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const Catalog({
    required this.id,
    required this.name,
    this.description,
    this.status = 'active',
    this.coverImageUrl,
    this.productsCount = 0,
    this.createdAt,
    this.updatedAt,
  });

  factory Catalog.fromJson(Map<String, dynamic> json) {
    return Catalog(
      id: _safeString(json['id']),
      name: _safeString(json['name']),
      description: _safeString(json['description']),
      status: _safeString(json['status']) ,
      coverImageUrl: _safeString(json['cover_image_url']),
      productsCount: json['products_count'] ?? 0,
      createdAt: _parseUtcDateTime(json['created_at']),
      updatedAt: _parseUtcDateTime(json['updated_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'description': description,
      'status': status,
      'cover_image_url': coverImageUrl,
    };
  }
}

class CatalogProduct {
  final String id;
  final String catalogId;
  final String name;
  final String? description;
  final double price;
  final String currency;
  final String? imageUrl;
  final String? retailerId;
  final String status;
  final int sortOrder;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  const CatalogProduct({
    required this.id,
    required this.catalogId,
    required this.name,
    this.description,
    this.price = 0,
    this.currency = 'INR',
    this.imageUrl,
    this.retailerId,
    this.status = 'active',
    this.sortOrder = 0,
    this.createdAt,
    this.updatedAt,
  });

  factory CatalogProduct.fromJson(Map<String, dynamic> json) {
    return CatalogProduct(
      id: _safeString(json['id']),
      catalogId: _safeString(json['catalog_id']),
      name: _safeString(json['name']),
      description: _safeString(json['description']),
      price: (json['price'] as num?)?.toDouble() ?? 0,
      currency: _safeString(json['currency']) ,
      imageUrl: _safeString(json['image_url']),
      retailerId: _safeString(json['retailer_id']),
      status: _safeString(json['status']) ,
      sortOrder: json['sort_order'] ?? 0,
      createdAt: _parseUtcDateTime(json['created_at']),
      updatedAt: _parseUtcDateTime(json['updated_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'catalog_id': catalogId,
      'name': name,
      'description': description,
      'price': price,
      'currency': currency,
      'image_url': imageUrl,
      if (retailerId != null && retailerId!.isNotEmpty) 'retailer_id': retailerId,
      'status': status,
      'sort_order': sortOrder,
    };
  }
}
