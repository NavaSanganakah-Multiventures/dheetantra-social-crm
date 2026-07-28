import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import 'home_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailController = TextEditingController();
  final _otpController = TextEditingController();
  final _apiService = ApiService();

  bool _otpSent = false;
  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    _checkLogin();
  }

  Future<void> _checkLogin() async {
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getString('auth_session') != null) {
      if (mounted) {
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const HomeScreen()));
      }
    }
  }

  void _sendOtp() async {
    setState(() => _isLoading = true);
    try {
      await _apiService.sendOtp(_emailController.text);
      setState(() => _otpSent = true);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('OTP Sent!')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _verifyOtp() async {
    setState(() => _isLoading = true);
    try {
      final response = await _apiService.verifyOtp(_emailController.text, _otpController.text);
      if (response.statusCode == 200) {
        final data = response.data;
        if (data['workspaceId'] != null) {
          final prefs = await SharedPreferences.getInstance();
          await prefs.setString('workspace_id', data['workspaceId']);
        }
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Login Successful!')));
          Navigator.pushReplacement(context, MaterialPageRoute(builder: (context) => const HomeScreen()));
        }
      }
    } catch (e) {
      if (mounted) {
         ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Invalid OTP: $e')));
      }
    } finally {
       setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Login to CRM')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Icon(Icons.support_agent, size: 80, color: Colors.indigo),
              const SizedBox(height: 32),
              const Text('Welcome Back', textAlign: TextAlign.center, style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
              const SizedBox(height: 32),
              TextField(
                controller: _emailController,
                decoration: InputDecoration(
                  labelText: 'Email Address',
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                  prefixIcon: const Icon(Icons.email),
                ),
                enabled: !_otpSent,
                keyboardType: TextInputType.emailAddress,
              ),
              const SizedBox(height: 16),
              if (_otpSent)
                TextField(
                  controller: _otpController,
                  decoration: InputDecoration(
                    labelText: 'Enter OTP',
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                    prefixIcon: const Icon(Icons.lock),
                  ),
                  keyboardType: TextInputType.number,
                ),
              const SizedBox(height: 32),
              _isLoading
                ? const Center(child: CircularProgressIndicator())
                : ElevatedButton(
                    onPressed: _otpSent ? _verifyOtp : _sendOtp,
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                    ),
                    child: Text(_otpSent ? 'Verify OTP' : 'Send OTP', style: const TextStyle(fontSize: 16)),
                  )
            ],
          ),
        ),
      ),
    );
  }
}
