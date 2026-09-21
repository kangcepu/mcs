import 'package:flutter_test/flutter_test.dart';
import 'package:mcs_mobile/app/core/constants/api_constants.dart';
import 'package:mcs_mobile/app/data/models/work_order_model.dart';

void main() {
  setUp(() {
    ApiConstants.setUrls(
      mcsBaseUrl: 'http://127.0.0.1:3000/api',
      mcsWebBaseUrl: 'http://192.168.10.100:8888/mcs',
      soBaseUrl: 'https://so.padmoasm.com',
      soWsUrl: 'wss://so.padmoasm.com',
    );
  });

  test('PartImage.url is resolved to an absolute backend URL', () {
    final image = PartImage.fromJson({
      'name': 'foto.jpg',
      'path': 'wo_ga/foto.jpg',
      'url': '/uploads/wo_ga/foto.jpg',
    });

    expect(image.url, 'http://127.0.0.1:3000/uploads/wo_ga/foto.jpg');
  });

  test('PartExecutionMedia.url is resolved and numeric fields stay safe',
      () {
    final media = PartExecutionMedia.fromJson({
      'id': 12,
      'custom_detail_id': 7762,
      'part_mesin': 'Body mesin',
      'media_type': 'video',
      'name': 'clip.mp4',
      'url': '/uploads/wo_operational/clip.mp4',
      'created_by': 'Teknisi',
      'created_at': '2026-09-17 10:00:00',
    });

    expect(media.id, 12);
    expect(media.customDetailId, 7762);
    expect(media.mediaType, 'video');
    expect(media.url, 'http://127.0.0.1:3000/uploads/wo_operational/clip.mp4');
  });

  test('WorkOrder.fromJson tolerates numeric AssetID without throwing', () {
    final wo = WorkOrder.fromJson({
      'wo_number': 'WOGA-092026/HRGA/0001',
      'date': '2026-09-17',
      'company': 'GSU',
      'shift': 'REGULAR',
      'type_wo': 'CORRECTIVE',
      'priority': 'NORMAL',
      'id_division': '7',
      'id_equipment': 45,
      'job_title': 'Perbaikan AC',
      'running_hours': '',
      'job_requirement': '',
      'job_executor': 'HRGA',
      'status': 'WAIT_KA_DIV_HRGA',
      'pic': 'HRGA',
      'creator': 'Budi',
      'created_at': '2026-09-17 08:00:00',
      'AssetID': 45,
    });

    expect(wo.idEquipment, '45');
    expect(wo.assetId, '45');
  });
}
