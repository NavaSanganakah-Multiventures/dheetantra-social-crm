import 'package:flutter/material.dart';
import '../services/api_service.dart';

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
      await _apiService.verifyOtp(_emailController.text, _otpController.text);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Login Successful!')));
        // Navigate to Home or Chat Screen
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
      appBar: AppBar(title: const Text('Login / Register')),
      body: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            TextField(
              controller: _emailController,
              decoration: const InputDecoration(labelText: 'Email Address'),
              enabled: !_otpSent,
            ),
            const SizedBox(height: 20),
            if (_otpSent)
              TextField(
                controller: _otpController,
                decoration: const InputDecoration(labelText: 'Enter OTP'),
              ),
            const SizedBox(height: 30),
            _isLoading
              ? const CircularProgressIndicator()
              : ElevatedButton(
                  onPressed: _otpSent ? _verifyOtp : _sendOtp,
                  child: Text(_otpSent ? 'Verify OTP' : 'Send OTP'),
                )
          ],
        ),
      ),
    );
  }
}
