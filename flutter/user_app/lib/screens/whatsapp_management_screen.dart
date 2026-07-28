import 'package:flutter/material.dart';
import '../services/api_service.dart';

class WhatsAppManagementScreen extends StatefulWidget {
  const WhatsAppManagementScreen({super.key});

  @override
  State<WhatsAppManagementScreen> createState() => _WhatsAppManagementScreenState();
}

class _WhatsAppManagementScreenState extends State<WhatsAppManagementScreen> {
  final ApiService _apiService = ApiService();
  List<dynamic> _configs = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _fetchConfigs();
  }

  Future<void> _fetchConfigs() async {
    try {
      final response = await _apiService.getWhatsAppConfigs();
      if (response.statusCode == 200) {
        setState(() {
          _configs = response.data['data'] ?? [];
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
      appBar: AppBar(title: const Text('WhatsApp Accounts')),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _configs.isEmpty
              ? const Center(child: Text('No WhatsApp accounts connected'))
              : ListView.builder(
                  itemCount: _configs.length,
                  itemBuilder: (context, index) {
                    final config = _configs[index];
                    return ListTile(
                      leading: const Icon(Icons.phone_android, color: Colors.green),
                      title: Text(config['phone_number_id'] ?? 'Unknown Phone'),
                      subtitle: Text('WABA ID: ${config['waba_id'] ?? 'N/A'}'),
                      trailing: const Icon(Icons.check_circle, color: Colors.green),
                    );
                  },
                ),
    );
  }
}
