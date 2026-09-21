import 'package:flutter_test/flutter_test.dart';
import 'package:mcs_mobile/app/data/models/notification_model.dart';

void main() {
  test('parses the real backend /v2/notifications response shape', () {
    // Matches what src/lib/notifications.ts (mcs_backend) actually returns:
    // {status, message, data: {total_notifications, preventive_wo,
    // in_progress_wo, summary: {total_preventive, total_in_progress}}}.
    final summary = NotificationSummary.fromJson({
      'status': true,
      'message': 'Success',
      'data': {
        'total_notifications': 3,
        'preventive_wo': [
          {
            'wo_number': 'PREV-092026/GBJ/0001',
            'date': '2026-09-17',
            'job_title': 'PREVENTIVE GSU/KP-WHS/0001',
            'status': 'WAIT_KA_DIV',
            'AssetName': 'MESIN INJECT 6',
            'AssetID': 64,
          },
        ],
        'in_progress_wo': [
          {
            'wo_number': 'WO-092026/MTC/0002',
            'date': '2026-09-17',
            'job_title': 'Ganti oli',
            'status': 'IN_PROGRESS_EXECUTOR',
          },
        ],
        'summary': {'total_preventive': 1, 'total_in_progress': 1},
      },
    });

    expect(summary.status, true);
    expect(summary.data, isNotNull);
    expect(summary.data!.totalNotifications, 3);
    expect(summary.data!.preventiveWo, hasLength(1));
    expect(summary.data!.inProgressWo, hasLength(1));
    expect(summary.data!.summary.totalPreventive, 1);
    expect(summary.data!.summary.totalInProgress, 1);
    expect(summary.data!.preventiveWo.first.assetId, '64');
  });

  test('falls back to counting the lists when total_notifications is absent',
      () {
    final summary = NotificationSummary.fromJson({
      'status': true,
      'message': 'Success',
      'data': {
        'preventive_wo': [
          {'wo_number': 'A', 'date': '', 'job_title': '', 'status': ''},
          {'wo_number': 'B', 'date': '', 'job_title': '', 'status': ''},
        ],
        'in_progress_wo': [],
        'summary': {'total_preventive': 2, 'total_in_progress': 0},
      },
    });

    expect(summary.data!.totalNotifications, 2);
  });

  test('handles a failure response without data', () {
    final summary = NotificationSummary.fromJson({
      'status': false,
      'message': 'Unauthorized',
    });

    expect(summary.status, false);
    expect(summary.data, isNull);
  });
}
