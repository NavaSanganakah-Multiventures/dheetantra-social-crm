// Basic smoke test for the DheeTantra user app.

import 'package:flutter_test/flutter_test.dart';

import 'package:dheetantra_user/main.dart';

void main() {
  testWidgets('App boots, shows splash, then navigates to login', (WidgetTester tester) async {
    await tester.pumpWidget(const DheeTantraApp());

    expect(find.text('DheeTantra'), findsOneWidget);
    expect(find.text('सोशल CRM - अपने ग्राहकों से जुड़े रहें'), findsOneWidget);

    await tester.pump(const Duration(milliseconds: 1900));
    await tester.pumpAndSettle();

    expect(find.text('वापसी पर स्वागत है!'), findsOneWidget);
    expect(find.text('OTP भेजें'), findsOneWidget);
  });
}
