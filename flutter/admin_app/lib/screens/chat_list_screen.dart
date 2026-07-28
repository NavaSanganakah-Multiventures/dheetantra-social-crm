import 'package:flutter/material.dart';
import '../services/api_service.dart';
import 'chat_screen.dart';

class ChatListScreen extends StatefulWidget {
  const ChatListScreen({super.key});

  @override
  State<ChatListScreen> createState() => _ChatListScreenState();
}

class _ChatListScreenState extends State<ChatListScreen> {
  final ApiService _apiService = ApiService();
  List<dynamic> _conversations = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchConversations();
  }

  Future<void> _fetchConversations() async {
    try {
      final response = await _apiService.getActiveConversations();
      if (response.statusCode == 200) {
        setState(() {
          _conversations = response.data['data'] ?? [];
          _isLoading = false;
        });
      }
    } catch (e) {
      setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Admin Dashboard Chats'), backgroundColor: Colors.red.shade800),
      body: _isLoading
        ? const Center(child: CircularProgressIndicator())
        : _conversations.isEmpty
          ? const Center(child: Text('No active conversations across workspace'))
          : ListView.builder(
              itemCount: _conversations.length,
              itemBuilder: (context, index) {
                final chat = _conversations[index];
                return ListTile(
                  leading: CircleAvatar(
                    backgroundColor: Colors.red.shade100,
                    child: Text(chat['contact_name']?.substring(0, 1).toUpperCase() ?? '?'),
                  ),
                  title: Text(chat['contact_name'] ?? 'Unknown'),
                  subtitle: Text(chat['last_message'] ?? 'No messages yet', maxLines: 1, overflow: TextOverflow.ellipsis,),
                  onTap: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (context) => ChatScreen(
                          contactId: chat['contact_id'],
                          contactName: chat['contact_name'] ?? 'Unknown',
                        ),
                      ),
                    );
                  },
                );
              },
            ),
    );
  }
}
