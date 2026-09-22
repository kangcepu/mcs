import 'package:flutter_test/flutter_test.dart';
import 'package:mcs_mobile/app/modules/daily_control/controllers/daily_control_controller.dart';

void main() {
  test(
    'counts a participant name even when another participant id is present',
    () {
      final controller = DailyControlController();
      controller.selectedDivisionFilter.value = 'MTC';
      controller.selectedMtcAreaFilter.value = 'GSU_WNB';
      controller.selectedMaintenanceKindFilter.value = 'preventive';
      controller.teamUsers.add(
        const DailyControlUser(
          idUser: 1,
          name: 'DEDI',
          fullname: 'Dedi Full Name',
          alias: 'DEDI',
          role: 'Maintenance',
          idPosition: 'EXECUTOR_ADMIN',
          divisionCode: 'MTC',
          woCategoryGeneral: 1,
          woCategoryElectrical: 0,
          woCategoryMould: 0,
          mtcAreaGsuWnb: 1,
          mtcAreaGsuInject: 0,
          mtcAreaRuSawmill: 0,
          mtcAreaRuProduction: 0,
        ),
      );

      controller.activities.addAll([
        for (var index = 1; index <= 6; index++)
          _preventiveActivity(
            id: index,
            participantUserIds: const [1],
            participantNames: const ['DEDI'],
          ),
        _preventiveActivity(
          id: 7,
          participantUserIds: const [99],
          participantNames: const ['Dedi Full Name'],
        ),
      ]);

      final dedi = controller.userUpdateStatuses.single;
      expect(dedi.updateCount, 7);
      expect(controller.preventiveDoneCount, 7);
    },
  );
}

DailyControlActivity _preventiveActivity({
  required int id,
  required List<int> participantUserIds,
  required List<String> participantNames,
}) {
  return DailyControlActivity(
    id: id,
    idUser: participantUserIds.first,
    user: participantUserIds.contains(1) ? 'DEDI' : 'Other Actor',
    division: 'Maintenance',
    divisionCode: 'MTC',
    date: '2026-08-04',
    time: '08:00:00',
    title: 'Preventive WNB $id',
    notes: '',
    assetCode: 'WNB-$id',
    assetName: 'WNB Asset $id',
    partMesin: '',
    woNumber: 'WO-WNB-$id',
    maintenanceKind: 'preventive',
    maintenanceActionLabel: '',
    requestPartLabel: '',
    executorCodeRaw: 'MTC',
    mesoSubtype: '',
    sourceTable: 'tb_wo_mtc_operational',
    mtcAreaKey: 'GSU_WNB',
    media: const [],
    commentCount: 0,
    unreadCount: 0,
    tags: const [],
    followUps: const [],
    participantUserIds: participantUserIds,
    participantNames: participantNames,
    laborNames: const [],
    readerNames: const [],
    displayFullname: '',
  );
}
