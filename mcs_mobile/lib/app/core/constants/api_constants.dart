class ApiConstants {
  static String _baseUrl = 'https://mcs.padmoasm.com/api';
  static String _webBaseUrl = 'https://mcs.padmoasm.com';
  static String _soBaseUrl = 'https://so.padmoasm.com';
  static String _soWsUrl = 'wss://so.padmoasm.com';

  static void setUrls({
    required String mcsBaseUrl,
    required String mcsWebBaseUrl,
    required String soBaseUrl,
    required String soWsUrl,
  }) {
    _baseUrl = mcsBaseUrl;
    _webBaseUrl = mcsWebBaseUrl;
    _soBaseUrl = soBaseUrl;
    _soWsUrl = soWsUrl;
  }

  static String get baseUrl => _baseUrl;
  static String get webBaseUrl => _webBaseUrl;
  static String get soBaseUrl => _soBaseUrl;
  static String get soWsUrl => _soWsUrl;

  static const String avatarPath = '/assets/img/profile/';

  /// Avatar lama (sebelum migrasi) cuma nama file, disajikan dari web
  /// legacy. Avatar baru (upload lewat backend baru) berupa path relatif
  /// (mis. `uploads/avatars/xxx.jpg`) — disajikan dari origin API baru.
  static String getAvatarUrl(String? filename) {
    if (filename == null || filename.isEmpty || filename == 'avatar.png') {
      return '';
    }
    final value = filename.trim();
    if (value.startsWith('uploads/') || value.startsWith('/uploads/')) {
      return mediaUrl(value);
    }
    if (value.contains('/')) return uploadUrl(value);
    return uploadUrl('assets/img/profile/$value');
  }

  static String uploadUrl(String relativePath) {
    return mediaUrl('/uploads/$relativePath');
  }

  /// `baseUrl` tanpa akhiran `/api` — sama seperti hubungan
  /// `MCS_BASE_URL_LOCAL` ke `MCS_WEB_BASE_URL_LOCAL` di `.env` (beda cuma di
  /// akhiran `/api`). Dipakai buat nyusun URL absolut dari path relatif yang
  /// backend kembalikan (mis. `/uploads/...`), dan tetap menjaga prefix app
  /// legacy (mis. `/mcs`) kalau `baseUrl` masih menunjuk ke server lama.
  static String get apiOrigin {
    final trimmed = baseUrl.replaceFirst(RegExp(r'/api/?$'), '');
    return trimmed.isEmpty ? baseUrl : trimmed;
  }

  /// Backend mengembalikan path relatif (mis. `/uploads/wo_ga/xxx.jpg`) yang
  /// disajikan dari origin API yang sama (baik dari disk lokal maupun
  /// proxy MinIO) — bukan dari `webBaseUrl` legacy. URL absolut (http/https)
  /// dikembalikan apa adanya.
  static String mediaUrl(String? path) {
    if (path == null) return '';
    final value = path.trim();
    if (value.isEmpty) return '';
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return value;
    }
    final origin = apiOrigin;
    final cleanPath = value
        .replaceAll('\\', '/')
        .split('/')
        .where((segment) => segment.isNotEmpty)
        .map(Uri.encodeComponent)
        .join('/');
    return '$origin/$cleanPath';
  }

  static const Duration connectTimeout = Duration(seconds: 30);
  static const Duration receiveTimeout = Duration(seconds: 30);

  // Debug-only HTTP logging (REQUEST/RESPONSE/ERROR) from ApiService.
  // Default off to keep Logcat clean; enable when troubleshooting.
  static bool enableHttpLog = false;

  // Semua path di bawah ini diarahkan ke kontrak /v2 backend baru
  // (mcs_backend). authRouter juga tersedia di /v2 selain di /api bare,
  // jadi auth ikut dipindah ke /v2 supaya semua modul konsisten satu skema.
  static const String login = '/v2/auth/login';
  static const String changePassword = '/v2/auth/change_password';
  static const String validate = '/v2/auth/validate';
  static const String profile = '/v2/auth/profile';
  static const String profileAvatar = '/v2/profile/avatar';
  static const String registerDeviceToken = '/v2/auth/register_device_token';
  static const String unregisterDeviceToken =
      '/v2/auth/unregister_device_token';

  static const String woStatuses = '/v2/master/wotypes';
  static const String woTypes = '/v2/master/wotypes';
  static const String priorities = '/v2/master/priorities';
  static const String companies = '/v2/master/companies';
  static const String divisions = '/v2/master/divisions';
  static const String sections = '/v2/master/sections';
  static const String reports = '/v2/reports';
  static const String assets = '/v2/assets';
  static const String assetDetail = '/v2/assets/detail';
  static const String assetMutationMeta = '/v2/asset-mutations/meta';
  static const String assetMutationAssets = '/v2/asset-mutations/assets';
  static const String assetMutationRequests = '/v2/asset-mutations';
  static const String assetMutationRequestDetail =
      '/v2/asset-mutations/detail';
  static const String assetMutationAddDetail =
      '/v2/asset-mutations/detail-item';
  static const String assetMutationDeleteDetail =
      '/v2/asset-mutations/detail-item-delete';
  static const String assetMutationSubmit = '/v2/asset-mutations/submit';
  static const String assetMutationApprove = '/v2/asset-mutations/approve';

  // Domain IT/IS (dulu '/wo/*' generik, sekarang eksplisit '/v2/is/*').
  static const String createWo = '/v2/is/create';
  static const String updateWo = '/v2/is/update';
  static const String detailWo = '/v2/is/detail';
  static const String listWo = '/v2/is/list';
  static const String approveWo = '/v2/is/approve';
  static const String addJobExplanationWo = '/v2/is/add_job_explanation';
  static const String addLaborWo = '/v2/is/add_labor';
  static const String addMaterialWo = '/v2/is/add_material';
  static const String completeWo = '/v2/is/complete';
  static const String closeWo = '/v2/is/closed';
  static const String voidWo = '/v2/is/void';
  static const String dashboardWo = '/v2/is/dashboard';
  static const String myWo = '/v2/is/my_wo';
  static const String getNewWo = '/v2/is/get_new';
  static const String deleteExecutorWo = '/v2/is/delete_executor';

  static const String createWoGa = '/v2/ga/create';
  static const String updateWoGa = '/v2/ga/update';
  static const String detailWoGa = '/v2/ga/detail';
  static const String listWoGa = '/v2/ga/list';
  static const String approveWoGa = '/v2/ga/approve';
  static const String addJobExplanationWoGa = '/v2/ga/add_job_explanation';
  static const String addLaborWoGa = '/v2/ga/add_labor';
  static const String addMaterialWoGa = '/v2/ga/add_material';
  static const String completeWoGa = '/v2/ga/complete';
  static const String closeWoGa = '/v2/ga/closed';
  static const String voidWoGa = '/v2/ga/void';
  static const String dashboardWoGa = '/v2/ga/dashboard';
  static const String myWoGa = '/v2/ga/my_wo';
  static const String getNewWoGa = '/v2/ga/get_new';
  static const String deleteExecutorWoGa = '/v2/ga/delete_executor';

  static const String createWoProduction = '/v2/production/create';
  static const String updateWoProduction = '/v2/production/update';
  static const String detailWoProduction = '/v2/production/detail';
  static const String listWoProduction = '/v2/production/list';
  static const String approveWoProduction = '/v2/production/approve';
  static const String addJobExplanationWoProduction =
      '/v2/production/add_job_explanation';
  static const String addLaborWoProduction = '/v2/production/add_labor';
  static const String addMaterialWoProduction =
      '/v2/production/add_material';
  static const String completeWoProduction = '/v2/production/complete';
  static const String closeWoProduction = '/v2/production/closed';
  static const String voidWoProduction = '/v2/production/void';
  static const String dashboardWoProduction = '/v2/production/dashboard';
  static const String myWoProduction = '/v2/production/my_wo';
  static const String deleteExecutorWoProduction =
      '/v2/production/delete_executor';

  // Domain MESO (dulu '/wo_mtc/*', sekarang '/v2/meso/*').
  static const String listWoMtc = '/v2/meso/list';
  static const String pendingWoMtc = '/v2/meso/pending';
  static const String approvedWoMtc = '/v2/meso/approved';
  static const String rejectedWoMtc = '/v2/meso/rejected';
  static const String detailWoMtc = '/v2/meso/detail';
  static const String createWoMtc = '/v2/meso/create';
  static const String updateWoMtc = '/v2/meso/update';
  static const String deleteWoMtc = '/v2/meso/delete';
  static const String generateNumberWoMtc = '/v2/meso/generate_number';
  static const String dashboardWoMtc = '/v2/meso/dashboard';
  static const String uploadAttachmentWoMtc = '/v2/meso/upload_attachment';

  static const String executorWoMtc = '/v2/meso/executor';
  static const String executorDetailWoMtc = '/v2/meso/executor_detail';
  static const String deleteExecutorWoMtc = '/v2/meso/delete_executor';
  static const String jobExplanationWoMtc = '/v2/meso/job_explanation';

  static const String laborWoMtc = '/v2/meso/labor';

  static const String materialWoMtc = '/v2/meso/material';

  static const String approvalWoMtc = '/v2/meso/approval';
  static const String approveWoMtc = '/v2/meso/approve';
  static const String completeWoMtc = '/v2/meso/complete';
  static const String materialRequestWoMtc = '/v2/meso/material_request';
  static const String materialReceivedWoMtc = '/v2/meso/material_received';
  static const String materialPurchaseWoMtc = '/v2/meso/material_purchase';
  static const String openAttachmentWoMtc = '/v2/meso/open_attachment';

  static const String subWoMtc = '/v2/meso/sub_wo';
  static const String voidWoMtc = '/v2/meso/void';
  static const String assetHistoryWoMtc = '/v2/meso/asset_history';

  // Domain Maintenance/Operational (dulu '/wo_operational/*', sekarang '/v2/maintenance/*').
  static const String listWoOperational = '/v2/maintenance/list';
  static const String detailWoOperational = '/v2/maintenance/detail';
  static const String dashboardWoOperational = '/v2/maintenance/dashboard';
  static const String myWoOperational = '/v2/maintenance/my_wo';
  static const String createWoOperational = '/v2/maintenance/create';
  static const String updateWoOperational = '/v2/maintenance/update';
  static const String updateAssetWoOperational =
      '/v2/maintenance/update_asset';
  static const String deleteWoOperational = '/v2/maintenance/delete';
  static const String approveWoOperational = '/v2/maintenance/approve';
  static const String declineWoOperational = '/v2/maintenance/decline';
  static const String forwardWoOperational = '/v2/maintenance/forward';
  static const String addJobExplanationWoOperational =
      '/v2/maintenance/add_job_explanation';
  static const String updateExecutorWoOperational =
      '/v2/maintenance/update_executor';
  static const String deleteExecutorWoOperational =
      '/v2/maintenance/delete_executor';
  static const String addLaborWoOperational = '/v2/maintenance/add_labor';
  static const String removeLaborWoOperational =
      '/v2/maintenance/remove_labor';
  static const String addMaterialWoOperational =
      '/v2/maintenance/add_material';
  static const String removeMaterialWoOperational =
      '/v2/maintenance/remove_material';
  static const String getMaterialReceivedWoOperational =
      '/v2/maintenance/get_material_received';
  static const String partExecutionWoOperational =
      '/v2/maintenance/part_execution';
  static const String partExecutionMediaWoOperational =
      '/v2/maintenance/part_execution_media';
  static const String materialSuggestionWoOperational =
      '/v2/maintenance/material_suggestions';
  static const String materialDetailWoOperational =
      '/v2/maintenance/material_detail';
  static const String addSubWoOperational = '/v2/maintenance/add_sub_wo';
  static const String voidDocumentWoOperational =
      '/v2/maintenance/void_document';
  static const String voidCandidatesWoOperational =
      '/v2/maintenance/void_candidates';
  static const String voidPreventiveWoOperational =
      '/v2/maintenance/void_preventive';
  static const String voidHistoryWoOperational =
      '/v2/maintenance/void_history';
  static const String getNewWoOperational = '/v2/maintenance/get_new';
  static const String getListUserWoOperational =
      '/v2/maintenance/get_list_user';
  static const String partExecutionWoMtc = '/v2/meso/part_execution';
  static const String partExecutionMediaWoMtc =
      '/v2/meso/part_execution_media';

  // Daily Control (dulu '/daily_control/*', sekarang '/v2/daily-control/*').
  static const String dailyControlList = '/v2/daily-control';
  static const String dailyControlCreate = '/v2/daily-control/create';
  static const String dailyControlAssetOptions =
      '/v2/daily-control/asset_options';
  static const String dailyControlAssetPartOptions =
      '/v2/daily-control/asset_part_options';
  static const String dailyControlWoOptions = '/v2/daily-control/wo_options';
  static const String dailyControlComments = '/v2/daily-control/comments';
  static const String dailyControlCommentCreate = '/v2/daily-control/comment';
  static const String dailyControlPartMentions =
      '/v2/daily-control/part-mentions';
  static const String dailyControlMarkRead = '/v2/daily-control/mark_read';
  static const String dailyControlUnreadCount =
      '/v2/daily-control/unread_count';
  static const String dailyControlUnreadActivities =
      '/v2/daily-control/unread_activities';
  static const String dailyControlScheduledSummary =
      '/v2/daily-control/scheduled_summary';

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

  // Material/part request (dulu '/material_part_request/*', sekarang
  // '/v2/material-usage/*' — kontrak sama dengan yang dipakai web).
  static const String materialPartRequest = '/v2/material-usage/request';
  static const String materialPartRequestList = '/v2/material-usage/list';
  static const String materialPartRequestSelect =
      '/v2/material-usage/select-parts';
  static const String materialPartRequestCancel =
      '/v2/material-usage/cancel';

  // Notifikasi (dulu hardcode '/notification/summary' & '/notification/detail'
  // langsung di repository-nya, bukan lewat ApiConstants — path itu tidak
  // pernah ada di backend manapun; endpoint asli plural '/v2/notifications').
  static const String notificationSummary = '/v2/notifications';
  static const String notificationDetail = '/v2/notifications/detail';

  // Rilis versi mobile ("cek update paksa"), dulu '/version/latest'.
  static const String mobileRelease = '/v2/mcs-mobile/release';

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
