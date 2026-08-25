import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import '../services/websocket_service.dart';

class ChatScreen extends StatefulWidget {
  final Conversation conversation;

  const ChatScreen({super.key, required this.conversation});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _inputController = TextEditingController();
  List<Message> _messages = [];
  bool _loading = true;
  String _contactName = '';
  String _contactPhone = '';
  StreamSubscription? _newMessageSub;
  StreamSubscription? _statusSub;
  final ScrollController _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _contactName = widget.conversation.contact.name;
    _contactPhone = widget.conversation.contact.phone;
    _loadMessages();

    _newMessageSub = WebSocketService().onNewMessage.listen((data) {
      if (!mounted) return;
      final msgData = data['message'];
      if (msgData is! Map) return;
      if (msgData['conversation_id'] == widget.conversation.id) {
        setState(() {
          final newMsg = Message.fromJson(Map<String, dynamic>.from(msgData));
          final existingIdx = _messages.indexWhere((m) => m.id == newMsg.id);
          if (existingIdx != -1) {
            _messages[existingIdx] = newMsg;
          } else {
            final localIdx = _messages.indexWhere((m) => m.id.startsWith('local_') && m.text == newMsg.text);
            if (localIdx != -1) {
              _messages[localIdx] = newMsg;
            } else {
              _messages.add(newMsg);
            }
          }
        });
        _scrollToBottom();
      }
    });

    _statusSub = WebSocketService().onMessageStatusUpdated.listen((data) {
      if (!mounted) return;
      if (data['conversation_id'] == widget.conversation.id) {
        setState(() {
          final idx = _messages.indexWhere((m) => m.id == data['message_id']);
          if (idx != -1) {
            _messages[idx] = _messages[idx].copyWith(
              isRead: data['status'] == 'read',
              status: data['status'],
            );
          }
        });
      }
    });
  }

  void _scrollToBottom({bool animate = true}) {
    if (!_scrollController.hasClients) return;
    final target = _scrollController.position.maxScrollExtent;
    if (!animate) {
      _scrollController.jumpTo(target);
      return;
    }
    Future.delayed(const Duration(milliseconds: 100), () {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        target,
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  void dispose() {
    _newMessageSub?.cancel();
    _statusSub?.cancel();
    _inputController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _loadMessages() async {
    if (widget.conversation.id.isEmpty) {
      setState(() {
        _messages = [];
        _loading = false;
      });
      return;
    }

    setState(() => _loading = true);
    final result = await ApiService().getMessages(widget.conversation.id);
    if (!mounted) return;

    final msgList = (result['messages'] as List?)
            ?.map((j) => Message.fromJson(j))
            .toList() ??
        [];

    // Merge instead of blind-replace: a realtime message that arrived while
    // this fetch was in flight (added to [_messages] by the WS listener) must
    // not be wiped out when the fetched list replaces the state. Such messages
    // are always newer than the fetched window, so appending them keeps the
    // thread chronologically correct.
    final inFlight = _messages
        .where((m) => !msgList.any((x) => x.id == m.id))
        .toList();

    // Update contact info from conversation data if available
    if (result['conversation'] != null) {
      final conv = result['conversation'];
      if (conv['contact_name'] != null) _contactName = conv['contact_name'];
      if (conv['phone'] != null) _contactPhone = conv['phone'];
    }

    setState(() {
      _messages = [...msgList, ...inFlight];
      _loading = false;
    });
    _scrollToBottom(animate: false);
  }

  Future<void> _send() async {
    final text = _inputController.text.trim();
    if (text.isEmpty) return;

    final tempMsgId = 'local_${DateTime.now().millisecondsSinceEpoch}';
    setState(() {
      _messages.add(Message(
        id: tempMsgId,
        text: text,
        time: DateTime.now(),
        isMine: true,
        isRead: false,
      ));
      _inputController.clear();
    });
    _scrollToBottom();

    final res = await ApiService().sendMessage(
      to: _contactPhone,
      text: text,
      conversationId: widget.conversation.id,
      platform: widget.conversation.platform,
    );

    if (res['error'] != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${res['error']}')),
      );
      setState(() {
        _messages.removeWhere((m) => m.id == tempMsgId);
      });
    } else if (mounted) {
      // Backend response shape varies ({data:{id}}, {message:{id}}, or {id}) â
      // handle all so the optimistic temp message gets its real id.
      Object? serverId;
      final d = res['data'];
      if (d is Map) serverId = d['id'];
      if (serverId == null) {
        final m = res['message'];
        if (m is Map) serverId = m['id'];
      }
      serverId ??= res['id'];
      setState(() {
        final idx = _messages.indexWhere((m) => m.id == tempMsgId);
        if (idx != -1) {
          _messages[idx] = _messages[idx].copyWith(
            id: serverId?.toString() ?? tempMsgId,
            status: 'sent',
          );
        }
      });
    }
  }

  Future<void> _initiateCall() async {
    final contactId = widget.conversation.contact.id;
    if (contactId.isEmpty) return;
    try {
      final res = await ApiService().dio.post('/api/whatsapp/calls', data: {
        'contactId': contactId,
        'type': 'voice',
        'direction': 'outgoing',
        'status': 'ringing',
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            res.data['success'] == true ? 'à¤à¥à¤² à¤¶à¥à¤°à¥ à¤à¥ à¤à¤' : 'à¤à¥à¤² à¤¶à¥à¤°à¥ à¤¨à¤¹à¥à¤ à¤¹à¥ à¤¸à¤à¥',
          ),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('à¤à¥à¤² à¤¶à¥à¤°à¥ à¤¨à¤¹à¥à¤ à¤¹à¥ à¤¸à¤à¥')),
      );
    }
  }

  Future<void> _showTemplatePicker() async {
    final templates = await ApiService().getTemplates();
    if (!mounted) return;
    if (templates.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('à¤à¥à¤ à¤à¥à¤®à¥à¤ªà¤²à¥à¤ à¤à¤ªà¤²à¤¬à¥à¤§ à¤¨à¤¹à¥à¤ à¤¹à¥')),
      );
      return;
    }
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppColors.surfaceAlt,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'à¤à¥à¤®à¥à¤ªà¤²à¥à¤ à¤à¥à¤¨à¥à¤',
                style: TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
            Flexible(
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: templates.length,
                itemBuilder: (context, i) {
                  final t = templates[i];
                  final name = t['name'] ?? 'Template';
                  final body = t['body_text'] ?? t['body'] ?? '';
                  return ListTile(
                    title: Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: AppColors.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    subtitle: Text(
                      body,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                    ),
                    onTap: () {
                      Navigator.of(ctx).pop();
                      _inputController.text = body;
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          onPressed: () => Navigator.of(context).pop(),
        ),
        titleSpacing: 0,
        title: Row(
          children: [
            Avatar(name: _contactName, size: 38),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _contactName,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                  ),
                  Row(
                    children: [
                      Flexible(
                        child: Text(
                          _contactPhone,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            color: AppColors.textMuted,
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      PlatformBadge(platform: widget.conversation.platform),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          if (widget.conversation.platform != 'email')
            IconButton(
              onPressed: widget.conversation.contact.id.isEmpty ? null : _initiateCall,
              icon: const Icon(Icons.call_outlined, color: AppColors.success, size: 21),
            ),
          IconButton(
            onPressed: _loadMessages,
            icon: const Icon(Icons.refresh_rounded, size: 21),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _loading
                ? const Center(child: CircularProgressIndicator())
                : _messages.isEmpty
                    ? const Center(
                        child: EmptyState(
                          icon: Icons.chat_outlined,
                          title: 'à¤à¥à¤ à¤¸à¤à¤¦à¥à¤¶ à¤¨à¤¹à¥à¤',
                          subtitle: 'à¤¬à¤¾à¤¤à¤à¥à¤¤ à¤¶à¥à¤°à¥ à¤à¤°à¥à¤à¥¤',
                        ),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 20),
                        itemCount: _messages.length,
                        itemBuilder: (context, i) {
                          final m = _messages[i];
                          return _MessageBubble(message: m);
                        },
                      ),
          ),
          _buildInputBar(),
        ],
      ),
    );
  }

  Widget _buildInputBar() {
    final isEmail = widget.conversation.platform == 'email';
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          if (!isEmail)
            IconButton(
              onPressed: _showTemplatePicker,
              tooltip: 'à¤à¥à¤®à¥à¤ªà¤²à¥à¤',
              icon: const Icon(Icons.description_outlined, color: AppColors.textMuted, size: 22),
            ),
          if (isEmail) const SizedBox(width: 8),
          Expanded(
            child: TextField(
              controller: _inputController,
              minLines: 1,
              maxLines: isEmail ? 8 : 4,
              textCapitalization: TextCapitalization.sentences,
              onSubmitted: (_) => _send(),
              decoration: InputDecoration(
                hintText: isEmail ? 'à¤à¤®à¥à¤² à¤à¤¾ à¤à¤µà¤¾à¤¬ à¤¦à¥à¤...' : 'à¤¸à¤à¤¦à¥à¤¶ à¤²à¤¿à¤à¥à¤...',
                contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 11),
                isDense: true,
              ),
            ),
          ),
          const SizedBox(width: 8),
          GestureDetector(
            onTap: _send,
            child: Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                gradient: AppColors.brandGradient,
                borderRadius: BorderRadius.circular(14),
              ),
              child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
            ),
          ),
        ],
      ),
    );
  }
}

class _MessageBubble extends StatelessWidget {
  final Message message;

  const _MessageBubble({required this.message});

  // à¤¹à¤¿à¤à¤¦à¥ à¤®à¥à¤ type label (web dashboard à¤à¥ MEDIA_LABELS à¤¸à¥ à¤®à¥à¤² à¤à¤¾à¤¤à¤¾ à¤¹à¥)
  String? get _typeLabel {
    switch (message.messageType) {
      case 'image': return 'à¤«à¤¼à¥à¤à¥';
      case 'video': return 'à¤µà¥à¤¡à¤¿à¤¯à¥';
      case 'audio': return 'à¤à¤¡à¤¿à¤¯à¥';
      case 'document': return 'à¤¦à¤¸à¥à¤¤à¤¾à¤µà¥à¤à¤¼';
      case 'sticker': return 'à¤¸à¥à¤à¤¿à¤à¤°';
      case 'location': return 'à¤²à¥à¤à¥à¤¶à¤¨';
      case 'contacts': return 'à¤à¥à¤¨à¥à¤à¥à¤à¥à¤';
      case 'template': return 'à¤à¥à¤®à¥à¤ªà¤²à¥à¤';
      case 'interactive': return 'à¤à¤à¤à¤°à¥à¤à¥à¤à¤¿à¤µ';
      case 'reaction': return 'à¤°à¤¿à¤à¤à¥à¤¶à¤¨';
      case 'order': return 'à¤à¤°à¥à¤¡à¤°';
      case 'button': return 'à¤¬à¤à¤¨';
      case 'system': return 'à¤¸à¤¿à¤¸à¥à¤à¤®';
      default: return message.messageType;
    }
  }

  Future<void> _openUrl(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  // media_url à¤à¥ à¤à¤¨à¥à¤¸à¤¾à¤° media preview (image/sticker inline, à¤¬à¤¾à¤à¥
  // types à¤à¥ à¤²à¤¿à¤ tappable tile à¤à¥ à¤¬à¤¾à¤¹à¤°à¥ à¤à¤ª à¤®à¥à¤ à¤à¥à¤²à¤¤à¤¾ à¤¹à¥)
  Widget? _buildMedia(BuildContext context) {
    final type = message.messageType;
    final raw = message.mediaUrl;
    if (type == null || type == 'text' || type == 'email' || type == 'agent') return null;
    if (raw == null || raw.isEmpty) return null;

    final mine = message.isMine;
    final fg = mine ? Colors.white : AppColors.textPrimary;

    // JSON payloads (location / contacts)
    Object? parsed;
    try {
      parsed = jsonDecode(raw);
    } catch (_) {
      parsed = null;
    }

    if (type == 'location' && parsed is Map) {
      final lat = parsed['latitude'];
      final lng = parsed['longitude'];
      final name = parsed['name'];
      final address = parsed['address'];
      return _mediaTile(
        icon: Icons.location_on,
        title: (name != null && name.toString().isNotEmpty) ? name.toString() : 'à¤²à¥à¤à¥à¤¶à¤¨',
        subtitle: (address != null && address.toString().isNotEmpty)
            ? address.toString()
            : (lat != null && lng != null ? '$lat, $lng' : null),
        fg: fg,
        onTap: (lat != null && lng != null)
            ? () => _openUrl('https://www.google.com/maps?q=$lat,$lng')
            : null,
      );
    }


    if (type == 'interactive' && parsed is Map) {
      final subtype = parsed['interactive']?['type'] ?? parsed['interactive_type'];
      String title = '';
      String subtitle = '';
      if (parsed['button_title'] != null) {
        title = _safeString(parsed['button_title']);
        subtitle = parsed['button_id'] != null ? 'ID: ' + _safeString(parsed['button_id']) : '';
      } else if (parsed['list_title'] != null) {
        title = _safeString(parsed['list_title']);
        subtitle = parsed['list_description'] != null ? _safeString(parsed['list_description']) : '';
      } else if (parsed['nfm_response'] != null) {
        final nfm = parsed['nfm_response'] is Map ? parsed['nfm_response'] as Map : null;
        title = nfm != null && nfm['name'] != null ? _safeString(nfm['name']) : 'Flow Reply';
        subtitle = nfm != null && nfm['body'] != null ? _safeString(nfm['body']) : '';
      }
      return _mediaTile(
        icon: Icons.touch_app,
        title: title.isNotEmpty ? title : 'Interactive',
        subtitle: subtitle.isNotEmpty ? subtitle : null,
        fg: fg,
      );
    }

    if (type == 'button' && parsed is Map) {
      final button = parsed['button'] is Map ? parsed['button'] as Map : null;
      final text = button?['text']?.toString() ?? '';
      final payload = button?['payload']?.toString() ?? '';
      return _mediaTile(
        icon: Icons.smart_button,
        title: text.isNotEmpty ? text : 'Button reply',
        subtitle: payload.isNotEmpty ? 'Payload: ' + payload : null,
        fg: fg,
      );
    }

    if (type == 'order' && parsed is Map) {
      final order = parsed['order'] is Map ? parsed['order'] as Map : null;
      final items = order?['product_items'] as List?;
      String title = order?['text']?.toString() ?? 'Order';
      String subtitle = '';
      if (items != null && items.isNotEmpty) {
        subtitle = items.asMap().entries.map((e) {
          final it = e.value is Map ? e.value as Map : null;
          final name = it?['product_retailer_id']?.toString() ?? 'Product';
          final qty = it?['quantity']?.toString() ?? '';
          final price = it?['item_price']?.toString() ?? '';
          return (e.key + 1).toString() + '. ' + name + (qty.isNotEmpty ? ' x' + qty : '') + (price.isNotEmpty ? ' @' + price : '');
        }).join('\n');
      }
      return _mediaTile(
        icon: Icons.shopping_bag,
        title: title,
        subtitle: subtitle.isNotEmpty ? subtitle : null,
        fg: fg,
      );
    }

    if (type == 'unsupported' && parsed is Map) {
      final err = (parsed['errors'] as List?)?.firstOrNull as Map?;
      final title = err?['title']?.toString() ?? 'Unsupported message';
      final details = err?['error_data']?['details']?.toString() ?? '';
      return _mediaTile(
        icon: Icons.error_outline,
        title: title,
        subtitle: details.isNotEmpty ? details : null,
        fg: fg,
      );
    }

    if (type == 'contacts' && parsed is List && parsed.isNotEmpty) {
      final rows = parsed.map((c) {
        final n = (c is Map && c['name'] is Map) ? c['name']['formatted_name'] : null;
        final p = (c is Map && c['phones'] is List && (c['phones'] as List).isNotEmpty)
            ? ((c['phones'][0] is Map) ? c['phones'][0]['phone'] : c['phones'][0])
            : null;
        return 'ð¤ ${n ?? 'à¤à¥à¤¨à¥à¤à¥à¤à¥à¤'}${p != null ? ' â $p' : ''}';
      }).toList();
      return _mediaTile(icon: Icons.contacts, title: rows.join('\n'), fg: fg);
    }

    // Relative R2 paths à¤à¥ absolute à¤¬à¤¨à¤¾à¤à¤
    final url = raw.startsWith('/api/') ? '${ApiService.baseUrl}$raw' : raw;
    final isUrl = url.startsWith('http');

    if (type == 'image' && isUrl) {
      return ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 240, maxHeight: 240),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Image.network(
            url,
            fit: BoxFit.contain,
            loadingBuilder: (ctx, child, progress) => progress == null
                ? child
                : Container(
                    height: 140,
                    color: mine ? Colors.white24 : AppColors.border,
                    child: Center(
                      child: SizedBox(
                        width: 22, height: 22,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: mine ? Colors.white : AppColors.accent,
                        ),
                      ),
                    ),
                  ),
            errorBuilder: (ctx, e, st) => Container(
              height: 140,
              color: mine ? Colors.white24 : AppColors.border,
              child: Icon(Icons.broken_image, color: mine ? Colors.white70 : AppColors.textMuted),
            ),
          ),
        ),
      );
    }

    if (type == 'sticker' && isUrl) {
      return ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 130, maxHeight: 130),
        child: Image.network(
          url,
          fit: BoxFit.contain,
          errorBuilder: (ctx, e, st) => Text('ð', style: const TextStyle(fontSize: 44)),
        ),
      );
    }

    if (type == 'video' && isUrl) {
      return _mediaTile(
        icon: Icons.play_circle_fill,
        title: 'à¤µà¥à¤¡à¤¿à¤¯à¥',
        fg: fg,
        onTap: () => _openUrl(url),
      );
    }

    if (type == 'audio' && isUrl) {
      return _mediaTile(
        icon: Icons.mic,
        title: message.text.contains('Voice') || message.text.contains('à¤µà¥à¤¯à¤¸')
            ? 'à¤µà¥à¤¯à¤¸ à¤¨à¥à¤'
            : 'à¤à¤¡à¤¿à¤¯à¥',
        fg: fg,
        onTap: () => _openUrl(url),
      );
    }

    if (type == 'document' && isUrl) {
      return _mediaTile(
        icon: Icons.description,
        title: (message.text.isNotEmpty && message.text != 'Document Message')
            ? message.text
            : 'à¤¦à¤¸à¥à¤¤à¤¾à¤µà¥à¤à¤¼',
        fg: fg,
        onTap: () => _openUrl(url),
      );
    }

    return null;
  }

  Widget _mediaTile({
    required IconData icon,
    required String title,
    String? subtitle,
    required Color fg,
    VoidCallback? onTap,
  }) {
    final tile = Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: message.isMine ? Colors.white.withValues(alpha: 0.15) : AppColors.surface,
        borderRadius: BorderRadius.circular(10),
        border: message.isMine ? null : Border.all(color: AppColors.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Icon(icon, size: 30, color: fg),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  title,
                  style: TextStyle(color: fg, fontSize: 13, fontWeight: FontWeight.w600),
                ),
                if (subtitle != null && subtitle.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    subtitle,
                    style: TextStyle(color: fg.withValues(alpha: 0.7), fontSize: 11),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
    if (onTap == null) return tile;
    return InkWell(onTap: onTap, borderRadius: BorderRadius.circular(10), child: tile);
  }

  @override
  Widget build(BuildContext context) {
    final mine = message.isMine;
    // Responsive: bubble never wider than 76% of a narrow phone, capped at 480
    // on tablets/desktop so lines stay readable.
    final maxBubbleWidth = MediaQuery.of(context).size.width * 0.76;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
        constraints: BoxConstraints(
          maxWidth: maxBubbleWidth < 480 ? maxBubbleWidth : 480,
        ),
        decoration: BoxDecoration(
          color: mine ? AppColors.accent : AppColors.surface,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(mine ? 16 : 4),
            bottomRight: Radius.circular(mine ? 4 : 16),
          ),
          border: mine ? null : Border.all(color: AppColors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (message.subject != null && message.subject!.isNotEmpty) ...[
              SizedBox(
                width: double.infinity,
                child: Text(
                  message.subject!,
                  style: TextStyle(
                    color: mine ? Colors.white : AppColors.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(height: 6),
              Divider(
                height: 1,
                color: mine ? Colors.white.withValues(alpha: 0.2) : AppColors.border,
              ),
              const SizedBox(height: 6),
            ],
            // Media (image/sticker inline, video/audio/document/location/
            // contacts tiles) â text/caption à¤à¤¸à¤à¥ à¤¨à¥à¤à¥
            ...(_buildMedia(context) != null ? [_buildMedia(context)!] : const <Widget>[]),
            SizedBox(
              width: double.infinity,
              child: Text(
                message.text,
                style: TextStyle(
                  color: mine ? Colors.white : AppColors.textPrimary,
                  fontSize: 14,
                  height: 1.35,
                ),
              ),
            ),
            if (message.messageType != null &&
                message.messageType != 'text' &&
                message.messageType != 'email' &&
                message.messageType != 'agent')
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  'ð ${_typeLabel ?? message.messageType}',
                  style: TextStyle(
                    color: mine ? Colors.white.withValues(alpha: 0.7) : AppColors.textMuted,
                    fontSize: 10,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            const SizedBox(height: 3),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  timeLabel(message.time),
                  style: TextStyle(
                    color: mine ? Colors.white.withValues(alpha: 0.7) : AppColors.textMuted,
                    fontSize: 10,
                  ),
                ),
                if (mine) ...[
                  const SizedBox(width: 4),
                  Icon(
                    message.status == 'read' || message.status == 'delivered'
                        ? Icons.done_all_rounded
                        : Icons.done_rounded,
                    size: 14,
                    color: message.status == 'read'
                        ? const Color(0xFF60A5FA) // Blue color for read
                        : Colors.white.withValues(alpha: 0.7), // Grey/White for sent/delivered
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }
}
