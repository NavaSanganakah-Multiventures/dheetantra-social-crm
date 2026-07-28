import 'package:flutter/material.dart';
import '../services/api_service.dart';

class CallingScreen extends StatefulWidget {
  const CallingScreen({super.key});

  @override
  State<CallingScreen> createState() => _CallingScreenState();
}

class _CallingScreenState extends State<CallingScreen> {
  final ApiService _apiService = ApiService();
  List<dynamic> _calls = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchCalls();
  }

  Future<void> _fetchCalls() async {
    try {
      final response = await _apiService.getCalls();
      if (response.statusCode == 200) {
        setState(() {
          _calls = response.data['data'] ?? [];
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
      appBar: AppBar(title: const Text('Call Logs')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _calls.isEmpty
              ? const Center(child: Text('No call history'))
              : ListView.builder(
                  itemCount: _calls.length,
                  itemBuilder: (context, index) {
                    final call = _calls[index];
                    final isIncoming = call['direction'] == 'incoming';
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: isIncoming ? Colors.green.shade100 : Colors.blue.shade100,
                        child: Icon(isIncoming ? Icons.call_received : Icons.call_made,
                            color: isIncoming ? Colors.green : Colors.blue),
                      ),
                      title: Text(call['contact_name'] ?? 'Unknown Contact'),
                      subtitle: Text(call['status'] ?? 'Ended'),
                      trailing: Text('${call['duration'] ?? 0}s'),
                    );
                  },
                ),
    );
  }
}
