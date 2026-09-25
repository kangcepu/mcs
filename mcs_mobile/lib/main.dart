import 'package:flutter/material.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:get/get.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app/core/routes/app_routes.dart';
import 'app/core/constants/app_colors.dart';
import 'app/core/constants/app_motion.dart';
import 'app/core/utils/network_checker.dart';
import 'app/core/constants/api_constants.dart';
import 'app/core/services/push_notification_service.dart';
import 'app/core/services/realtime_service.dart';
import 'app/data/providers/update_provider.dart';
import 'app/core/widgets/responsive_app_wrapper.dart';

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
  await PushNotificationService.instance.ensureInitializedForBackground();
  await PushNotificationService.instance.handleRemoteMessage(
    message,
    shouldShowLocalNotification: message.notification == null,
    shouldUpdateBadge: true,
  );
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await dotenv.load(fileName: ".env");
  debugPrint('MCS_MOBILE_SOURCE=D:/Development/Mobile/mcs_mobile');
  await Firebase.initializeApp();
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

  final mcsBaseUrl = await NetworkChecker.getBaseUrl();
  final mcsWebBaseUrl = await NetworkChecker.getWebBaseUrl();
  final soBaseUrl = await NetworkChecker.getSoBaseUrl();
  final soWsUrl = await NetworkChecker.getSoWsUrl();

  ApiConstants.setUrls(
    mcsBaseUrl: mcsBaseUrl,
    mcsWebBaseUrl: mcsWebBaseUrl,
    soBaseUrl: soBaseUrl,
    soWsUrl: soWsUrl,
  );

  await PushNotificationService.instance.initialize();

  Get.put(UpdateProvider());
  Get.put(RealtimeService(), permanent: true).ensureStarted();

  runApp(const MyApp());
}

class MyApp extends StatefulWidget {
  const MyApp({Key? key}) : super(key: key);

  @override
  State<MyApp> createState() => _MyAppState();
}

class _MyAppState extends State<MyApp> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await PushNotificationService.instance
          .showPreventiveAlarmPermissionGuideIfNeeded();
      await PushNotificationService.instance.processPendingNavigation();
    });
  }

  @override
  Widget build(BuildContext context) {
    final manropeTextTheme = GoogleFonts.manropeTextTheme();
    final manropeFamily = GoogleFonts.manrope().fontFamily;

    return GetMaterialApp(
      title: 'MCS Mobile',
      debugShowCheckedModeBanner: false,
      builder: (context, child) {
        return ResponsiveAppWrapper(
          child: child ?? const SizedBox.shrink(),
        );
      },
      theme: ThemeData(
        fontFamily: manropeFamily,
        textTheme: manropeTextTheme,
        primaryTextTheme: manropeTextTheme,
        primaryColor: AppColors.primary,
        colorScheme: ColorScheme.fromSeed(
          seedColor: AppColors.primary,
          primary: AppColors.primary,
        ),
        scaffoldBackgroundColor: AppColors.background,
        appBarTheme: AppBarTheme(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.white,
          elevation: 0,
          centerTitle: true,
          titleTextStyle: GoogleFonts.manrope(
            color: AppColors.white,
            fontSize: 22,
            fontWeight: FontWeight.w600,
          ),
          toolbarTextStyle: GoogleFonts.manrope(
            color: AppColors.white,
            fontSize: 16,
            fontWeight: FontWeight.w500,
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: AppColors.white,
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          filled: true,
          fillColor: AppColors.white,
        ),
        useMaterial3: true,
      ),
      initialRoute: AppRoutes.login,
      getPages: AppRoutes.routes,
      // Belum ada satu pun GetPage yang set `transition:` sendiri — default
      // di sini otomatis berlaku ke semua ~45 route sekaligus.
      defaultTransition: Transition.cupertino,
      transitionDuration: AppMotion.base,
    );
  }
}
