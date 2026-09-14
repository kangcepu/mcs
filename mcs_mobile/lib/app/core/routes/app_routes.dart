import 'package:get/get.dart';
import '../../modules/auth/views/login_page.dart';
import '../../modules/auth/views/force_password_change_page.dart';
import '../../modules/home/views/home_page.dart';
import '../../modules/wo/views/wo_list_page.dart';
import '../../modules/wo/views/wo_detail_page.dart';
import '../../modules/wo/views/wo_create_page.dart';
import '../../modules/wo_ga/views/wo_list_page.dart';
import '../../modules/wo_ga/views/wo_detail_page.dart';
import '../../modules/wo_ga/views/wo_create_page.dart';
import '../../modules/wo_production/views/wo_production_list_page.dart';
import '../../modules/wo_production/views/wo_production_detail_page.dart';
import '../../modules/wo_production/views/wo_production_create_page.dart';
import '../../modules/wo_mtc/views/wo_mtc_list_page.dart';
import '../../modules/wo_mtc/views/wo_mtc_detail_page.dart';
import '../../modules/wo_mtc/views/wo_mtc_create_page.dart';
import '../../modules/wo_operational/views/wo_operational_list_page.dart';
import '../../modules/wo_operational/views/wo_operational_detail_page.dart';
import '../../modules/wo_operational/views/wo_operational_create_page.dart';
import '../../modules/wo_operational/views/wo_operational_update_page.dart';
import '../../modules/wo_operational/views/wo_operational_dashboard_page.dart';
import '../../modules/wo_operational/views/wo_operational_job_explanation_page.dart';
import '../../modules/wo_operational/views/wo_operational_labor_add_page.dart';
import '../../modules/wo_operational/views/wo_operational_material_add_page.dart';
import '../../modules/wo_operational/views/wo_operational_sub_wo_page.dart';
import '../../modules/wo_operational/controllers/wo_operational_list_controller.dart';
import '../../modules/wo_operational/controllers/wo_operational_detail_controller.dart';
import '../../modules/wo_operational/controllers/wo_operational_create_controller.dart';
import '../../modules/wo_operational/controllers/wo_operational_update_controller.dart';
import '../../modules/wo_operational/controllers/wo_operational_dashboard_controller.dart';
import '../../modules/wo_operational/controllers/wo_operational_job_explanation_controller.dart';
import '../../modules/wo_operational/controllers/wo_operational_labor_controller.dart';
import '../../modules/wo_operational/controllers/wo_operational_material_controller.dart';
import '../../modules/wo_operational/controllers/wo_operational_sub_wo_controller.dart';
import '../../modules/wo_ga/controllers/wo_list_controller.dart';
import '../../modules/wo_ga/controllers/wo_detail_controller.dart';
import '../../modules/wo_ga/controllers/wo_create_controller.dart';
import '../../modules/stock_opname/views/stock_opname_list_page.dart';
import '../../modules/stock_opname/views/stock_opname_input_page.dart';
import '../../modules/stock_opname/views/stock_opname_input_bom_page.dart';
import '../../modules/stock_opname/views/non_asset_list_page.dart';
import '../../modules/stock_opname/views/non_part_list_page.dart';
import '../../modules/stock_opname/views/barcode_scan_page.dart';
import '../../modules/stock_opname/views/status_so_page.dart';
import '../../modules/stock_opname/controllers/stock_opname_controller.dart';
import '../../modules/stock_opname/controllers/stock_opname_input_controller.dart';
import '../../modules/stock_opname/controllers/stock_opname_input_bom_controller.dart';
import '../../modules/stock_opname/controllers/non_asset_controller.dart';
import '../../modules/stock_opname/controllers/non_part_controller.dart';
import '../../modules/stock_opname/controllers/status_so_controller.dart';
import '../../modules/scanning/views/wo_qr_scan_page.dart';
import '../../modules/reports/views/reports_page.dart';
import '../../modules/reports/views/report_asset_page.dart';
import '../../modules/reports/views/report_asset_detail_page.dart';
import '../../modules/reports/views/report_asset_mutation_page.dart';
import '../../modules/reports/views/report_asset_mutation_detail_page.dart';
import '../../modules/reports/views/report_asset_mutation_create_page.dart';
import '../../modules/reports/views/report_wo_recap_page.dart';
import '../../modules/reports/views/report_so_page.dart';
import '../../modules/reports/views/report_so_detail_page.dart';
import '../../modules/approval/views/approval_page.dart';
import '../../modules/daily_control/views/daily_control_page.dart';
import '../../modules/wo_void/views/wo_void_page.dart';
import '../../modules/wo_void/controllers/wo_void_controller.dart';

class AppRoutes {
  static const String login = '/login';
  static const String forcePasswordChange = '/force-password-change';
  static const String home = '/home';
  static const String woList = '/wo/list';
  static const String woDetail = '/wo/detail';
  static const String woCreate = '/wo/create';
  static const String woGaList = '/wo_ga/list';
  static const String woGaDetail = '/wo_ga/detail';
  static const String woGaCreate = '/wo_ga/create';
  static const String woProductionList = '/wo_production/list';
  static const String woProductionDetail = '/wo_production/detail';
  static const String woProductionCreate = '/wo_production/create';
  static const String woMtcList = '/wo_mtc/list';
  static const String woMtcDetail = '/wo_mtc/detail';
  static const String woMtcCreate = '/wo_mtc/create';
  static const String woOperationalList = '/wo_operational/list';
  static const String woOperationalDetail = '/wo_operational/detail';
  static const String woOperationalCreate = '/wo_operational/create';
  static const String woOperationalUpdate = '/wo_operational/update';
  static const String woOperationalDashboard = '/wo_operational/dashboard';
  static const String woOperationalJobExplanation =
      '/wo_operational/job_explanation';
  static const String woOperationalLaborAdd = '/wo_operational/labor/add';
  static const String woOperationalMaterialAdd = '/wo_operational/material/add';
  static const String woOperationalSubWo = '/wo_operational/sub_wo';
  static const String stockOpnameList = '/stock_opname/list';
  static const String stockOpnameInput = '/stock_opname/input';
  static const String stockOpnameInputBOM = '/stock_opname/input_bom';
  //static const String stockOpnameCreate = '/stock_opname/create';
  static const String stockOpnameNonAsset = '/stock_opname/non_asset';
  static const String stockOpnameNonPart = '/stock_opname/non_part';
  static const String stockOpnameScan = '/stock_opname/scan';
  static const String stockOpnameStatus = '/stock_opname/status';
  static const String woScan = '/scanning';
  static const String reports = '/reports';
  static const String reportAsset = '/reports/asset';
  static const String reportAssetDetail = '/reports/asset/detail';
  static const String reportAssetMutation = '/reports/asset_mutation';
  static const String reportAssetMutationCreate =
      '/reports/asset_mutation/create';
  static const String reportAssetMutationDetail =
      '/reports/asset_mutation/detail';
  static const String reportWoRecap = '/reports/wo_recap';
  static const String reportSo = '/reports/so';
  static const String reportSoDetail = '/reports/so/detail';
  static const String dailyControl = '/daily_control';
  static const String approval = '/approval';
  static const String woVoid = '/wo_void';

  static List<GetPage> routes = [
    GetPage(
      name: login,
      page: () => const LoginPage(),
    ),
    GetPage(
      name: forcePasswordChange,
      page: () => const ForcePasswordChangePage(),
    ),
    GetPage(
      name: home,
      page: () => const HomePage(),
    ),
    GetPage(
      name: woVoid,
      page: () => const WoVoidPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => WoVoidController());
      }),
    ),
    GetPage(
      name: woList,
      page: () => const WoListPage(),
    ),
    GetPage(
      name: woDetail,
      page: () => const WoDetailPage(),
    ),
    GetPage(
      name: woCreate,
      page: () => const WoCreatePage(),
    ),
    GetPage(
      name: woGaList,
      page: () => const WoGaListPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => WoGaListController());
      }),
    ),
    GetPage(
      name: woGaDetail,
      page: () => const WoGaDetailPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => WoGaDetailController());
      }),
    ),
    GetPage(
      name: woGaCreate,
      page: () => const WoGaCreatePage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => WoGaCreateController());
      }),
    ),
    GetPage(
      name: woProductionList,
      page: () => const WoProductionListPage(),
    ),
    GetPage(
      name: woProductionDetail,
      page: () => const WoProductionDetailPage(),
    ),
    GetPage(
      name: woProductionCreate,
      page: () => const WoProductionCreatePage(),
    ),
    GetPage(
      name: woMtcList,
      page: () => const WoMtcListPage(),
    ),
    GetPage(
      name: woMtcDetail,
      page: () => const WoMtcDetailPage(),
    ),
    GetPage(
      name: woMtcCreate,
      page: () => const WoMtcCreatePage(),
    ),
    GetPage(
      name: woOperationalList,
      page: () => const WoOperationalListPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => WoOperationalListController());
      }),
    ),
    GetPage(
      name: woOperationalDetail,
      page: () => const WoOperationalDetailPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => WoOperationalDetailController());
      }),
    ),
    GetPage(
      name: woOperationalCreate,
      page: () => const WoOperationalCreatePage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => WoOperationalCreateController());
      }),
    ),
    GetPage(
      name: woOperationalUpdate,
      page: () => const WoOperationalUpdatePage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => WoOperationalUpdateController());
      }),
    ),
    GetPage(
      name: woOperationalDashboard,
      page: () => const WoOperationalDashboardPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => WoOperationalDashboardController());
      }),
    ),
    GetPage(
      name: woOperationalJobExplanation,
      page: () => const WoOperationalJobExplanationPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => WoOperationalJobExplanationController());
      }),
    ),
    GetPage(
      name: woOperationalLaborAdd,
      page: () => const WoOperationalLaborAddPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => WoOperationalLaborController());
      }),
    ),
    GetPage(
      name: woOperationalMaterialAdd,
      page: () => const WoOperationalMaterialAddPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => WoOperationalMaterialController());
      }),
    ),
    GetPage(
      name: woOperationalSubWo,
      page: () => const WoOperationalSubWoPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => WoOperationalSubWoController());
      }),
    ),
    GetPage(
      name: stockOpnameList,
      page: () => const StockOpnameListPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => StockOpnameController());
      }),
    ),
    GetPage(
      name: stockOpnameInput,
      page: () => const StockOpnameInputPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => StockOpnameInputController());
      }),
    ),
    GetPage(
      name: stockOpnameInputBOM,
      page: () => const StockOpnameInputBOMPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => StockOpnameInputBOMController());
      }),
    ),
    GetPage(
      name: stockOpnameNonAsset,
      page: () => const NonAssetListPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => NonAssetController());
      }),
    ),
    GetPage(
      name: stockOpnameNonPart,
      page: () => const NonPartListPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => NonPartController());
      }),
    ),
    GetPage(
      name: stockOpnameScan,
      page: () => const BarcodeScanPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => StockOpnameInputController());
      }),
    ),
    GetPage(
      name: stockOpnameStatus,
      page: () => const StatusSoPage(),
      binding: BindingsBuilder(() {
        Get.lazyPut(() => StatusSoController());
      }),
    ),
    GetPage(
      name: woScan,
      page: () => const WoQrScanPage(),
    ),
    GetPage(
      name: reports,
      page: () => const ReportsPage(),
    ),
    GetPage(
      name: reportAsset,
      page: () => const ReportAssetPage(),
    ),
    GetPage(
      name: reportAssetDetail,
      page: () => const ReportAssetDetailPage(),
    ),
    GetPage(
      name: reportAssetMutation,
      page: () => const ReportAssetMutationPage(),
    ),
    GetPage(
      name: reportAssetMutationCreate,
      page: () => const ReportAssetMutationCreatePage(),
    ),
    GetPage(
      name: reportAssetMutationDetail,
      page: () => const ReportAssetMutationDetailPage(),
    ),
    GetPage(
      name: reportWoRecap,
      page: () => const ReportWoRecapPage(),
    ),
    GetPage(
      name: reportSo,
      page: () => const ReportSoPage(),
    ),
    GetPage(
      name: reportSoDetail,
      page: () => const ReportSoDetailPage(),
    ),
    GetPage(
      name: dailyControl,
      page: () => const DailyControlPage(),
    ),
    GetPage(
      name: approval,
      page: () => const ApprovalPage(),
    ),
  ];
}
