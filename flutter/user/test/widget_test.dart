// Basic smoke test for the DheeTantra user app.

import 'package:flutter_test/flutter_test.dart';

import 'package:dheetantra_user/main.dart';

void main() {
  testWidgets('App boots, shows splash, then navigates to login', (WidgetTester tester) async {
    await tester.pumpWidget(const DheeTantraApp());

    expect(find.text('DheeTantra'), findsOneWidget);
    expect(find.text('Social CRM - stay connected with your customers'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 1900));
    await tester.pumpAndSettle();

    expect(find.text('Welcome back!'), findsOneWidget);
    expect(find.text('Log in'), findsOneWidget);
  });
}
