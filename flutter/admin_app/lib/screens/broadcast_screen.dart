import 'package:flutter/material.dart';
import '../services/api_service.dart';

class BroadcastScreen extends StatefulWidget {
  const BroadcastScreen({super.key});

  @override
  State<BroadcastScreen> createState() => _BroadcastScreenState();
}

class _BroadcastScreenState extends State<BroadcastScreen> {
  final ApiService _apiService = ApiService();
  List<dynamic> _broadcasts = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchBroadcasts();
  }

  Future<void> _fetchBroadcasts() async {
    try {
      final response = await _apiService.getBroadcasts();
      if (response.statusCode == 200) {
        setState(() {
          _broadcasts = response.data['data'] ?? [];
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
      appBar: AppBar(title: const Text('Broadcasts')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _broadcasts.isEmpty
              ? const Center(child: Text('No broadcasts created yet'))
              : ListView.builder(
                  itemCount: _broadcasts.length,
                  itemBuilder: (context, index) {
                    final broadcast = _broadcasts[index];
                    return Card(
                      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: ListTile(
                        title: Text(broadcast['name'] ?? 'Campaign ${index+1}'),
                        subtitle: Text('Status: ${broadcast['status']}'),
                        trailing: Icon(Icons.campaign, color: Colors.indigo.shade300),
                      ),
                    );
                  },
                ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          // Navigate to Create Broadcast Screen (Placeholder)
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Create Broadcast Coming Soon')));
        },
        child: const Icon(Icons.add),
      ),
    );
  }
}
