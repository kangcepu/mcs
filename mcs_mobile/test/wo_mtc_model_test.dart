import 'package:flutter_test/flutter_test.dart';
import 'package:mcs_mobile/app/data/models/wo_mtc_model.dart';

void main() {
  test('does not throw when id_equipment comes back as an int (bigint column)',
      () {
    // Regression: the `id_equipment` column is a MySQL bigint, so the new
    // Node backend serializes it as a JSON number, not a string like the
    // legacy PHP backend did. Assigning it straight to a String field used
    // to throw "type 'int' is not a subtype of type 'String?'" and crashed
    // the WO MESO list screen.
    final wo = WorkOrderMtc.fromJson({
      'wo_number': 'WO-092026/MTC/0001',
      'date': '2026-09-17',
      'job_title': 'Ganti oli',
      'type_wo': 'CORRECTIVE',
      'status': 'WAIT_KA_DIV',
      'id_equipment': 45,
    });

    expect(wo.idEquipment, '45');
  });

  test('handles id_equipment as a string too', () {
    final wo = WorkOrderMtc.fromJson({
      'wo_number': 'WO-092026/MTC/0001',
      'date': '2026-09-17',
      'job_title': 'Ganti oli',
      'type_wo': 'CORRECTIVE',
      'status': 'WAIT_KA_DIV',
      'id_equipment': '45',
    });

    expect(wo.idEquipment, '45');
  });

  test('handles a missing id_equipment without throwing', () {
    final wo = WorkOrderMtc.fromJson({
      'wo_number': 'WO-092026/MTC/0002',
      'date': '2026-09-17',
      'job_title': 'Cek panel listrik',
      'type_wo': 'PREVENTIVE',
      'status': 'WAIT_KA_DIV',
    });

    expect(wo.idEquipment, isNull);
  });

  test('id_division and is_external stay tolerant of int or string input',
      () {
    final wo = WorkOrderMtc.fromJson({
      'wo_number': 'WO-092026/MTC/0003',
      'date': '2026-09-17',
      'job_title': 'x',
      'type_wo': 'CORRECTIVE',
      'status': 'WAIT_KA_DIV',
      'id_division': 15,
      'is_external': '1',
    });

    expect(wo.idDivision, 15);
    expect(wo.isExternal, 1);
  });
}
