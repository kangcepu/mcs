  static String get listNoSO => '$baseUrl/api/no-stock-opname';
  static String get masterCompany => '$baseUrl/api/master-company';
  static String get addNoSO => '$baseUrl/api/no-stock-opname/create';
  static String get addStatusSO => '$baseUrl/api/status';
  static String get listStatusSO => '$baseUrl/api/status';
  static String get deleteNoSO => '$baseUrl/api/no-stock-opname/delete';
  static String get updateSO => '$baseUrl/api/update-stock-opname';
  static String get uploadImg => '$baseUrl/api/upload-image';
  static String get editAssetImg => '$baseUrl/api/edit-image';
  static String get addNonAsset => '$baseUrl/api/no-asset-stock-opname/create';
  static String get addNonPart => '$baseUrl/api/non-part-stock-opname/create';
  static String get deleteNonAsset => '$baseUrl/api/no-asset-stock-opname/delete';
  static String get deleteNonPart => '$baseUrl/api/non-part-stock-opname/delete';
  static String get updateBOM => '$baseUrl/api/update-bom';
  static String updateNonAsset(int idNonAsset) => '$baseUrl/api/no-asset-stock-opname/update/$idNonAsset';
  static String updateNonPart(int idNonPart) => '$baseUrl/api/non-part-stock-opname/update/$idNonPart';
  static String viewAssetImg(String imgName) => '$baseUrl/api/upload/$imgName';
  static String deleteStatusSO(int idstatus) => '$baseUrl/api/status/$idstatus';
  static String updateStatusSO(int idstatus) => '$baseUrl/api/status/$idstatus';
  static String listNonAsset(String noso) => '$baseUrl/api/no-asset-stock-opname/$noso';
  static String listNonPart(String noso) => '$baseUrl/api/non-part-stock-opname/$noso';
  static String scanAsset(String noSO) => '$baseUrl/api/no-stock-opname/$noSO';
  static String listAssets(String selectedNoSO) => '$baseUrl/api/no-stock-opname/$selectedNoSO';
  static String listAssetsBefore(String selectedNoSO) => '$baseUrl/api/no-stock-opname-current/$selectedNoSO';
  static String listAssetsBeforeBOM(String selectedNoSO) => '$baseUrl/api/no-stock-opname-current-bom/$selectedNoSO';
  static String reportSO(String selectedNoSO) => '$baseUrl/api/report/$selectedNoSO/pdf';
  static String reportSOBOM(String selectedNoSO) => '$baseUrl/api/report-so-bom/$selectedNoSO/pdf';
  static String lockSO(String selectedNoSO) => '$baseUrl/api/no-stock-opname/$selectedNoSO/lock';

  static String getPartBOM(String noSO, String assetCode) {
    final encodedAssetCode = Uri.encodeComponent(assetCode);
    return '$baseUrl/api/part-bom?noSO=$noSO&assetCode=$encodedAssetCode';
  }

  static String realtimeStockOpname(String noSO) {
    return '$wsUrl/ws-stock-opname?noso=$noSO';
  }
