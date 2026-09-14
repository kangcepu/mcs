import 'package:flutter_test/flutter_test.dart';
import 'package:mcs_mobile/app/data/models/user_model.dart';

void main() {
  test('parses and serializes cross WO access permission', () {
    final permissions = Permissions.fromJson({
      'wo_cross_access': '1',
    });

    expect(permissions.woCrossAccess, 1);
    expect(permissions.toJson()['wo_cross_access'], 1);
  });

  test('parses and serializes WO executor permission', () {
    final permissions = Permissions.fromJson({
      'wo_executor': '1',
    });

    expect(permissions.woExecutor, 1);
    expect(permissions.toJson()['wo_executor'], 1);
  });

  test('parses and serializes WO VOID permission', () {
    final permissions = Permissions.fromJson({
      'wo_void': '1',
    });

    expect(permissions.woVoid, 1);
    expect(permissions.toJson()['wo_void'], 1);
  });
}
