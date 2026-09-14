class ApiConstants {
  static String _baseUrl = 'https://mcs.padmoasm.com/api';
  static String _webBaseUrl = 'https://mcs.padmoasm.com';
  static String _soBaseUrl = 'https://so.padmoasm.com';
  static String _soWsUrl = 'wss://so.padmoasm.com';
  static String _materialBaseUrl =
      'https://mcs.padmoasm.com/_svc8989/microserviceLive/material';

  static void setUrls({
    required String mcsBaseUrl,
    required String mcsWebBaseUrl,
    required String soBaseUrl,
    required String soWsUrl,
    String? materialBaseUrl,
  }) {
    _baseUrl = mcsBaseUrl;
    _webBaseUrl = mcsWebBaseUrl;
    _soBaseUrl = soBaseUrl;
    _soWsUrl = soWsUrl;
    if (materialBaseUrl != null && materialBaseUrl.trim().isNotEmpty) {
      _materialBaseUrl = materialBaseUrl;
    }
  }

  static String get baseUrl => _baseUrl;
  static String get webBaseUrl => _webBaseUrl;
  static String get soBaseUrl => _soBaseUrl;
  static String get soWsUrl => _soWsUrl;
  static String get materialBaseUrl => _materialBaseUrl;

  static const String avatarPath = '/assets/img/profile/';

  static String getAvatarUrl(String? filename) {
    if (filename == null || filename.isEmpty) return '';
    return '$webBaseUrl$avatarPath$filename';
  }

  static const Duration connectTimeout = Duration(seconds: 30);
  static const Duration receiveTimeout = Duration(seconds: 30);

  // Debug-only HTTP logging (REQUEST/RESPONSE/ERROR) from ApiService.
  // Default off to keep Logcat clean; enable when troubleshooting.
  static bool enableHttpLog = false;

  static const String login = '/auth/login';
  static const String changePassword = '/auth/change_password';
  static const String validate = '/auth/validate';
  static const String profile = '/auth/profile';
  static const String registerDeviceToken = '/auth/register_device_token';
  static const String unregisterDeviceToken = '/auth/unregister_device_token';

  static const String woStatuses = '/master/wostatuses';
  static const String woTypes = '/master/wotypes';
  static const String priorities = '/master/priorities';
  static const String companies = '/master/companies';
  static const String divisions = '/master/divisions';
  static const String sections = '/master/sections';
  static const String assets = '/master/assets';
  static const String assetDetail = '/master/asset_detail';
  static const String assetMutations = '/master/asset_mutations';
  static const String assetMutationMeta = '/asset_mutation/meta';
  static const String assetMutationAssets = '/asset_mutation/assets';
  static const String assetMutationRequests = '/asset_mutation/requests';
  static const String assetMutationRequestDetail =
      '/asset_mutation/request_detail';
  static const String assetMutationAddDetail = '/asset_mutation/detail';
  static const String assetMutationDeleteDetail =
      '/asset_mutation/detail_delete';
  static const String assetMutationSubmit = '/asset_mutation/submit';
  static const String assetMutationApprove = '/asset_mutation/approve';

  static const String createWo = '/wo/create';
  static const String updateWo = '/wo/update';
  static const String detailWo = '/wo/detail';
  static const String listWo = '/wo/list';
  static const String approveWo = '/wo/approve';
  static const String addJobExplanationWo = '/wo/add_job_explanation';
  static const String addLaborWo = '/wo/add_labor';
  static const String addMaterialWo = '/wo/add_material';
  static const String completeWo = '/wo/complete';
  static const String closeWo = '/wo/closed';
  static const String voidWo = '/wo/void';
  static const String dashboardWo = '/wo/dashboard';
  static const String myWo = '/wo/my_wo';
  static const String getNewWo = '/wo/get_new';

  static const String createWoGa = '/wo_ga/create';
  static const String updateWoGa = '/wo_ga/update';
  static const String detailWoGa = '/wo_ga/detail';
  static const String listWoGa = '/wo_ga/list';
  static const String approveWoGa = '/wo_ga/approve';
  static const String addJobExplanationWoGa = '/wo_ga/add_job_explanation';
  static const String addLaborWoGa = '/wo_ga/add_labor';
  static const String addMaterialWoGa = '/wo_ga/add_material';
  static const String completeWoGa = '/wo_ga/complete';
  static const String closeWoGa = '/wo_ga/closed';
  static const String voidWoGa = '/wo_ga/void';
  static const String dashboardWoGa = '/wo_ga/dashboard';
  static const String myWoGa = '/wo_ga/my_wo';
  static const String getNewWoGa = '/wo_ga/get_new';

  static const String createWoProduction = '/wo_production/create';
  static const String updateWoProduction = '/wo_production/update';
  static const String detailWoProduction = '/wo_production/detail';
  static const String listWoProduction = '/wo_production/list';
  static const String approveWoProduction = '/wo_production/approve';
  static const String addJobExplanationWoProduction =
      '/wo_production/add_job_explanation';
  static const String addLaborWoProduction = '/wo_production/add_labor';
  static const String addMaterialWoProduction = '/wo_production/add_material';
  static const String completeWoProduction = '/wo_production/complete';
  static const String closeWoProduction = '/wo_production/closed';
  static const String voidWoProduction = '/wo_production/void';
  static const String dashboardWoProduction = '/wo_production/dashboard';
  static const String myWoProduction = '/wo_production/my_wo';

  static const String listWoMtc = '/wo_mtc/list';
  static const String pendingWoMtc = '/wo_mtc/pending';
  static const String approvedWoMtc = '/wo_mtc/approved';
  static const String rejectedWoMtc = '/wo_mtc/rejected';
  static const String detailWoMtc = '/wo_mtc/detail';
  static const String createWoMtc = '/wo_mtc/create';
  static const String updateWoMtc = '/wo_mtc/update';
  static const String deleteWoMtc = '/wo_mtc/delete';
  static const String generateNumberWoMtc = '/wo_mtc/generate_number';
  static const String dashboardWoMtc = '/wo_mtc/dashboard';
  static const String uploadAttachmentWoMtc = '/wo_mtc/upload_attachment';

  static const String executorWoMtc = '/wo_mtc/executor';
  static const String executorDetailWoMtc = '/wo_mtc/executor_detail';
  static const String jobExplanationWoMtc = '/wo_mtc/job_explanation';

  static const String laborWoMtc = '/wo_mtc/labor';

  static const String materialWoMtc = '/wo_mtc/material';

  static const String approvalWoMtc = '/wo_mtc/approval';
  static const String approveWoMtc = '/wo_mtc/approve';
  static const String completeWoMtc = '/wo_mtc/complete';
  static const String materialRequestWoMtc = '/wo_mtc/material_request';
  static const String materialReceivedWoMtc = '/wo_mtc/material_received';
  static const String materialPurchaseWoMtc = '/wo_mtc/material_purchase';
  static const String openAttachmentWoMtc = '/wo_mtc/open_attachment';

  static const String subWoMtc = '/wo_mtc/sub_wo';
  static const String voidWoMtc = '/wo_mtc/void';
  static const String assetHistoryWoMtc = '/wo_mtc/asset_history';

  static const String listWoOperational = '/wo_operational/list';
  static const String detailWoOperational = '/wo_operational/detail';
  static const String dashboardWoOperational = '/wo_operational/dashboard';
  static const String myWoOperational = '/wo_operational/my_wo';
  static const String createWoOperational = '/wo_operational/create';
  static const String updateWoOperational = '/wo_operational/update';
  static const String updateAssetWoOperational = '/wo_operational/update_asset';
  static const String deleteWoOperational = '/wo_operational/delete';
  static const String approveWoOperational = '/wo_operational/approve';
  static const String declineWoOperational = '/wo_operational/decline';
  static const String forwardWoOperational = '/wo_operational/forward';
  static const String addJobExplanationWoOperational =
      '/wo_operational/add_job_explanation';
  static const String updateExecutorWoOperational =
      '/wo_operational/update_executor';
  static const String deleteExecutorWoOperational =
      '/wo_operational/delete_executor';
  static const String addLaborWoOperational = '/wo_operational/add_labor';
  static const String removeLaborWoOperational = '/wo_operational/remove_labor';
  static const String addMaterialWoOperational = '/wo_operational/add_material';
  static const String removeMaterialWoOperational =
      '/wo_operational/remove_material';
  static const String getMaterialReceivedWoOperational =
      '/wo_operational/get_material_received';
  static const String partExecutionWoOperational =
      '/wo_operational/part_execution';
  static const String partExecutionMediaWoOperational =
      '/wo_operational/part_execution_media';
  static const String materialSuggestionWoOperational =
      '/wo_operational/material_suggestions';
  static const String materialDetailWoOperational =
      '/wo_operational/material_detail';
  static const String addSubWoOperational = '/wo_operational/add_sub_wo';
  static const String voidDocumentWoOperational =
      '/wo_operational/void_document';
  static const String voidCandidatesWoOperational =
      '/wo_operational/void_candidates';
  static const String voidPreventiveWoOperational =
      '/wo_operational/void_preventive';
  static const String voidHistoryWoOperational = '/wo_operational/void_history';
  static const String getNewWoOperational = '/wo_operational/get_new';
  static const String getListUserWoOperational =
      '/wo_operational/get_list_user';
  static const String partExecutionWoMtc = '/wo_mtc/part_execution';
  static const String partExecutionMediaWoMtc = '/wo_mtc/part_execution_media';
  static const String dailyControlList = '/daily_control/list';
  static const String dailyControlCreate = '/daily_control/create';
  static const String dailyControlAssetOptions = '/daily_control/asset_options';
  static const String dailyControlAssetPartOptions =
      '/daily_control/asset_part_options';
  static const String dailyControlWoOptions = '/daily_control/wo_options';
  static const String dailyControlComments = '/daily_control/comments';
  static const String dailyControlCommentCreate = '/daily_control/comment';
  static const String dailyControlPartMentions = '/daily_control/part_mentions';
  static const String dailyControlMarkRead = '/daily_control/mark_read';
  static const String dailyControlUnreadCount = '/daily_control/unread_count';
  static const String dailyControlUnreadActivities =
      '/daily_control/unread_activities';
  static const String dailyControlScheduledSummary =
      '/daily_control/scheduled_summary';
  // Approval memakai kontrak V2 yang sama dengan web agar scope approval_all,
  // status, dan filter WO hasil schedule selalu konsisten lintas platform.
  static const String approvalSummary = '/v2/approval-center/summary';
  static const String approvalWoApprovals = '/v2/approval-center/wo-approvals';
  static const String approvalWoClosings = '/v2/approval-center/wo-closings';
  static const String approvalMutations = '/v2/approval-center/mutations';
  static const String approvalMaterials = '/v2/approval-center/materials';
  static const String approvalApproveWo = '/v2/approval-center/wo-approve';
  static const String approvalCloseWo = '/v2/approval-center/wo-close';
  static const String approvalApproveMutation =
      '/v2/approval-center/mutation-approve';

  static const String materialPartRequest = '/material_part_request/request';
  static const String materialPartRequestList = '/material_part_request/list';
  static const String materialPartRequestSelect =
      '/material_part_request/select';
  static const String materialPartRequestCancel =
      '/material_part_request/cancel';

  static String get listNoSO => '$soBaseUrl/api/no-stock-opname';
  static String get masterCompany => '$soBaseUrl/api/master-company';
  static String get addNoSO => '$soBaseUrl/api/no-stock-opname/create';
  static String get addStatusSO => '$soBaseUrl/api/status';
  static String get listStatusSO => '$soBaseUrl/api/status';
  static String get deleteNoSO => '$soBaseUrl/api/no-stock-opname/delete';
  static String get updateSO => '$soBaseUrl/api/update-stock-opname';
  static String get uploadImg => '$soBaseUrl/api/upload-image';
  static String get editAssetImg => '$soBaseUrl/api/edit-image';
  static String get addNonAsset =>
      '$soBaseUrl/api/no-asset-stock-opname/create';
  static String get addNonPart => '$soBaseUrl/api/non-part-stock-opname/create';
  static String get deleteNonAsset =>
      '$soBaseUrl/api/no-asset-stock-opname/delete';
  static String get deleteNonPart =>
      '$soBaseUrl/api/non-part-stock-opname/delete';
  static String get updateBOM => '$soBaseUrl/api/update-bom';

  static String updateNonAsset(int idNonAsset) =>
      '$soBaseUrl/api/no-asset-stock-opname/update/$idNonAsset';
  static String updateNonPart(int idNonPart) =>
      '$soBaseUrl/api/non-part-stock-opname/update/$idNonPart';
  static String viewAssetImg(String imgName) =>
      '$soBaseUrl/api/upload/$imgName';
  static String deleteStatusSO(int idstatus) =>
      '$soBaseUrl/api/status/$idstatus';
  static String updateStatusSO(int idstatus) =>
      '$soBaseUrl/api/status/$idstatus';
  static String listNonAsset(String noso) =>
      '$soBaseUrl/api/no-asset-stock-opname/$noso';
  static String listNonPart(String noso) =>
      '$soBaseUrl/api/non-part-stock-opname/$noso';
  static String scanAsset(String noSO) =>
      '$soBaseUrl/api/no-stock-opname/$noSO';
  static String scanAssetCheck(String noSO) =>
      '$soBaseUrl/api/no-stock-opname/$noSO/check';
  static String scanAssetSubmit(String noSO) =>
      '$soBaseUrl/api/no-stock-opname/$noSO/submit';
  static String listAssets(String selectedNoSO) =>
      '$soBaseUrl/api/no-stock-opname/$selectedNoSO';
  static String listAssetsBefore(String selectedNoSO) =>
      '$soBaseUrl/api/no-stock-opname-current/$selectedNoSO';
  static String listAssetsBeforeBOM(String selectedNoSO) =>
      '$soBaseUrl/api/no-stock-opname-current-bom/$selectedNoSO';
  static String reportSO(String selectedNoSO) =>
      '$soBaseUrl/api/report/$selectedNoSO/pdf';
  static String reportSOBOM(String selectedNoSO) =>
      '$soBaseUrl/api/report-so-bom/$selectedNoSO/pdf';
  static String lockSO(String selectedNoSO) =>
      '$soBaseUrl/api/no-stock-opname/$selectedNoSO/lock';

  static String getPartBOM(String noSO, String assetCode) {
    final encodedAssetCode = Uri.encodeComponent(assetCode);
    return '$soBaseUrl/api/part-bom?noSO=$noSO&assetCode=$encodedAssetCode';
  }

  static String realtimeStockOpname(String noSO) {
    return '$soWsUrl/ws-stock-opname?noso=$noSO';
  }
}
