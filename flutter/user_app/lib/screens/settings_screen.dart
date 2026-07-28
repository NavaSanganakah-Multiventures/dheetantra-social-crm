import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import 'login_screen.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final ApiService _apiService = ApiService();
  Map<String, dynamic>? _userProfile;

  @override
  void initState() {
    super.initState();
    _fetchProfile();
  }

  Future<void> _fetchProfile() async {
    try {
      final response = await _apiService.getUserProfile();
      if (response.statusCode == 200) {
        setState(() {
          _userProfile = response.data['user'];
        });
      }
    } catch (e) {
      // Ignore
    }
  }

  Future<void> _logout() async {
    try {
      await _apiService.logout();
    } catch (e) {
      // ignore
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    if (mounted) {
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (context) => const LoginScreen()),
        (route) => false,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          if (_userProfile != null)
            UserAccountsDrawerHeader(
              accountName: Text(_userProfile!['name'] ?? 'User'),
              accountEmail: Text(_userProfile!['email'] ?? ''),
              currentAccountPicture: CircleAvatar(
                backgroundColor: Colors.white,
                child: Text(_userProfile!['name']?.substring(0, 1) ?? 'U', style: const TextStyle(fontSize: 24, color: Colors.indigo)),
              ),
              decoration: const BoxDecoration(color: Colors.indigo),
            ),
          ListTile(
            leading: const Icon(Icons.person),
            title: const Text('Profile'),
            onTap: () {},
          ),
          ListTile(
            leading: const Icon(Icons.notifications),
            title: const Text('Notifications'),
            onTap: () {},
          ),
          const Divider(),
          ListTile(
            leading: const Icon(Icons.logout, color: Colors.red),
            title: const Text('Logout', style: TextStyle(color: Colors.red)),
            onTap: _logout,
          ),
        ],
      ),
    );
  }
}
