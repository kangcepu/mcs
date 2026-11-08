import 'package:flutter/widgets.dart';

/// Ambang sama dengan `_isTablet` di `responsive_app_wrapper.dart` — satu
/// definisi "tablet" dipakai konsisten baik untuk scaling teks maupun untuk
/// menentukan UI mana (phone/tablet) yang dirender.
const double kTabletShortestSideThreshold = 600;

bool isTabletLayout(BuildContext context) {
  final shortestSide = MediaQuery.of(context).size.shortestSide;
  return shortestSide >= kTabletShortestSideThreshold;
}
