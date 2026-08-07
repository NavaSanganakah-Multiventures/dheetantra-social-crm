import 'package:flutter/material.dart';

import '../models/models.dart';
import '../services/api_service.dart';
import '../theme/app_theme.dart';
import '../widgets/common.dart';
import '../services/websocket_service.dart';
import 'dart:async';

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
      if (msgData['conversation_id'] == widget.conversation.id) {
        setState(() {
          final newMsg = Message.fromJson(msgData);
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

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      Future.delayed(const Duration(milliseconds: 100), () {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      });
    }
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

    // Update contact info from conversation data if available
    if (result['conversation'] != null) {
      final conv = result['conversation'];
      if (conv['contact_name'] != null) _contactName = conv['contact_name'];
      if (conv['phone'] != null) _contactPhone = conv['phone'];
    }

    setState(() {
      _messages = msgList;
      _loading = false;
    });
    _scrollToBottom();
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
    );

    if (res['error'] != null && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${res['error']}')),
      );
      setState(() {
        _messages.removeWhere((m) => m.id == tempMsgId);
      });
    } else if (res['data'] != null && mounted) {
      setState(() {
        final idx = _messages.indexWhere((m) => m.id == tempMsgId);
        if (idx != -1) {
          _messages[idx] = _messages[idx].copyWith(id: res['data']['id'], status: 'sent');
        }
      });
    }
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
                  Text(
                    _contactPhone,
                    style: const TextStyle(
                      color: AppColors.textMuted,
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            onPressed: () {},
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
                          title: 'कोई संदेश नहीं',
                          subtitle: 'बातचीत शुरू करें।',
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
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
      decoration: const BoxDecoration(
        color: AppColors.surface,
        border: Border(top: BorderSide(color: AppColors.border)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.add_circle_outline_rounded, color: AppColors.textMuted),
          ),
          Expanded(
            child: TextField(
              controller: _inputController,
              minLines: 1,
              maxLines: 4,
              textCapitalization: TextCapitalization.sentences,
              onSubmitted: (_) => _send(),
              decoration: const InputDecoration(
                hintText: 'संदेश लिखें...',
                contentPadding: EdgeInsets.symmetric(horizontal: 16, vertical: 11),
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

  @override
  Widget build(BuildContext context) {
    final mine = message.isMine;
    return Align(
      alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 9),
        constraints: BoxConstraints(
          maxWidth: MediaQuery.of(context).size.width * 0.76,
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
            Text(
              message.text,
              style: TextStyle(
                color: mine ? Colors.white : AppColors.textPrimary,
                fontSize: 14,
                height: 1.35,
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
