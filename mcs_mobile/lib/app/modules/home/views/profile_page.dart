import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/constants/api_constants.dart';
import '../../../data/models/user_model.dart';
import '../../../data/repositories/auth_repository.dart';
import '../controllers/home_controller.dart';

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key});

  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  static const int _maxAvatarBytes = 2 * 1024 * 1024;
  static const int _minPasswordLength = 6;

  final AuthRepository _authRepository = AuthRepository();
  final HomeController _homeController = Get.find<HomeController>();
  final ImagePicker _imagePicker = ImagePicker();
  final TextEditingController _currentPasswordController =
      TextEditingController();
  final TextEditingController _newPasswordController = TextEditingController();
  final TextEditingController _confirmPasswordController =
      TextEditingController();

  User? _user;
  String? _pickedPhotoPath;
  bool _isLoading = true;
  bool _isSaving = false;
  bool _isPhotoBusy = false;
  bool _obscureCurrent = true;
  bool _obscureNew = true;
  bool _obscureConfirm = true;

  @override
  void initState() {
    super.initState();
    _loadProfile();
  }

  @override
  void dispose() {
    _currentPasswordController.dispose();
    _newPasswordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  Future<void> _loadProfile() async {
    setState(() {
      _user = _homeController.currentUser.value;
      _isLoading = false;
    });

    try {
      await _homeController.loadUserData();
      if (!mounted) return;
      setState(() => _user = _homeController.currentUser.value);
    } catch (_) {}
  }

  void _showMessage(String title, String message, {bool error = false}) {
    Get.snackbar(
      title,
      message,
      snackPosition: SnackPosition.BOTTOM,
      backgroundColor:
          error ? const Color(0xFFDC2626) : const Color(0xFF16A34A),
      colorText: Colors.white,
    );
  }

  bool get _hasSavedPhoto {
    final avatar = _user?.avatar.trim() ?? '';
    return avatar.isNotEmpty && avatar != 'avatar.png';
  }

  String? get _savedPhotoUrl {
    if (!_hasSavedPhoto) return null;
    final url = ApiConstants.getAvatarUrl(_user?.avatar);
    return url.isEmpty ? null : url;
  }

  String _initials(String name) {
    final parts =
        name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return (parts.first[0] + parts[1][0]).toUpperCase();
  }

  Future<void> _chooseSource() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.photo_library_outlined),
              title: const Text('Pilih dari Galeri'),
              onTap: () => Navigator.pop(context, ImageSource.gallery),
            ),
            ListTile(
              leading: const Icon(Icons.photo_camera_outlined),
              title: const Text('Ambil dengan Kamera'),
              onTap: () => Navigator.pop(context, ImageSource.camera),
            ),
          ],
        ),
      ),
    );
    if (source == null) return;

    try {
      final picked = await _imagePicker.pickImage(
        source: source,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 85,
      );
      if (picked == null) return;

      final size = await File(picked.path).length();
      if (size > _maxAvatarBytes) {
        _showMessage('Ukuran terlalu besar', 'Foto maksimal 2 MB.',
            error: true);
        return;
      }
      if (!mounted) return;
      setState(() => _pickedPhotoPath = picked.path);
    } catch (e) {
      _showMessage('Foto Profil', '$e', error: true);
    }
  }

  Future<void> _savePhoto() async {
    final path = _pickedPhotoPath;
    if (path == null) return;
    try {
      setState(() => _isPhotoBusy = true);
      await _authRepository.uploadAvatar(path);
      await _homeController.loadUserData();
      if (!mounted) return;
      setState(() {
        _pickedPhotoPath = null;
        _user = _homeController.currentUser.value;
      });
      _showMessage('Foto Profil', 'Foto profil diperbarui.');
    } catch (e) {
      _showMessage('Foto Profil', '$e', error: true);
    } finally {
      if (mounted) setState(() => _isPhotoBusy = false);
    }
  }

  Future<void> _removePhoto() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Hapus foto profil?'),
        content: const Text('Foto akan dihapus dan diganti inisial nama.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Batal'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;

    try {
      setState(() => _isPhotoBusy = true);
      await _authRepository.removeAvatar();
      await _homeController.loadUserData();
      if (!mounted) return;
      setState(() => _user = _homeController.currentUser.value);
      _showMessage('Foto Profil', 'Foto profil dihapus.');
    } catch (e) {
      _showMessage('Foto Profil', '$e', error: true);
    } finally {
      if (mounted) setState(() => _isPhotoBusy = false);
    }
  }

  String? get _newPasswordError {
    final value = _newPasswordController.text;
    if (value.isNotEmpty && value.length < _minPasswordLength) {
      return 'Minimal $_minPasswordLength karakter.';
    }
    return null;
  }

  String? get _confirmPasswordError {
    final value = _confirmPasswordController.text;
    if (value.isNotEmpty && value != _newPasswordController.text) {
      return 'Konfirmasi tidak cocok.';
    }
    return null;
  }

  Future<void> _submitChangePassword() async {
    final user = _user;
    if (user == null) {
      return;
    }

    final currentPassword = _currentPasswordController.text.trim();
    final newPassword = _newPasswordController.text.trim();
    final confirmPassword = _confirmPasswordController.text.trim();

    if (currentPassword.isEmpty ||
        newPassword.isEmpty ||
        confirmPassword.isEmpty) {
      _showMessage('Ganti Password', 'Semua field password wajib diisi.',
          error: true);
      return;
    }

    if (newPassword.length < _minPasswordLength) {
      _showMessage(
          'Ganti Password', 'Password baru minimal $_minPasswordLength karakter.',
          error: true);
      return;
    }

    if (newPassword != confirmPassword) {
      _showMessage('Ganti Password', 'Confirm password tidak sama.',
          error: true);
      return;
    }

    try {
      setState(() => _isSaving = true);
      final result = await _authRepository.changePassword(
        username: user.username,
        currentPassword: currentPassword,
        password: newPassword,
        confirmPassword: confirmPassword,
      );

      if (!mounted) return;

      _currentPasswordController.clear();
      _newPasswordController.clear();
      _confirmPasswordController.clear();

      _showMessage(
        'Ganti Password',
        result['message']?.toString() ?? 'Password berhasil diganti.',
      );
    } catch (e) {
      if (!mounted) return;
      _showMessage('Ganti Password', '$e', error: true);
    } finally {
      if (mounted) {
        setState(() => _isSaving = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF6F8FB),
      appBar: AppBar(
        title: const Text('Profile'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildIdentityCard(),
                  const SizedBox(height: 18),
                  _buildProfileCard(),
                  const SizedBox(height: 18),
                  _buildPasswordCard(),
                  const SizedBox(height: 18),
                  _buildLogoutCard(),
                ],
              ),
            ),
    );
  }

  BoxDecoration get _cardDecoration => BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 16,
            offset: const Offset(0, 6),
          ),
        ],
      );

  Widget _buildAvatar(User? user) {
    const size = 72.0;
    final initials = _initials(user?.fullname ?? '');
    final fallback = Center(
      child: Text(
        initials,
        style: const TextStyle(
          fontSize: 24,
          fontWeight: FontWeight.w800,
          color: Color(0xFF1D4ED8),
        ),
      ),
    );

    Widget content = fallback;
    final picked = _pickedPhotoPath;
    final savedUrl = _savedPhotoUrl;
    if (picked != null) {
      content = Image.file(File(picked), fit: BoxFit.cover);
    } else if (savedUrl != null) {
      content = CachedNetworkImage(
        imageUrl: savedUrl,
        fit: BoxFit.cover,
        placeholder: (_, __) => fallback,
        errorWidget: (_, __, ___) => fallback,
      );
    }

    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: const Color(0xFFDBEAFE),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE5E7EB)),
      ),
      clipBehavior: Clip.antiAlias,
      child: content,
    );
  }

  Widget _buildIdentityCard() {
    final user = _user;
    final hasPicked = _pickedPhotoPath != null;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: _cardDecoration,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              _buildAvatar(user),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      (user?.fullname ?? '').trim().isEmpty
                          ? '-'
                          : user!.fullname,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF111827),
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      user?.username ?? '-',
                      style: const TextStyle(
                        fontSize: 13,
                        color: Color(0xFF6B7280),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          const Divider(height: 1),
          const SizedBox(height: 14),
          const Text(
            'Foto Profil',
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: Color(0xFF6B7280),
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: _isPhotoBusy ? null : _chooseSource,
                icon: const Icon(Icons.image_outlined, size: 18),
                label: Text(hasPicked ? 'Ganti Pilihan' : 'Pilih Foto'),
              ),
              if (hasPicked)
                ElevatedButton(
                  onPressed: _isPhotoBusy ? null : _savePhoto,
                  child: _isPhotoBusy
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Text('Simpan Foto'),
                ),
              if (hasPicked)
                TextButton(
                  onPressed: _isPhotoBusy
                      ? null
                      : () => setState(() => _pickedPhotoPath = null),
                  child: const Text('Batal'),
                ),
              if (!hasPicked && _hasSavedPhoto)
                TextButton.icon(
                  onPressed: _isPhotoBusy ? null : _removePhoto,
                  style: TextButton.styleFrom(foregroundColor: Colors.red),
                  icon: const Icon(Icons.delete_outline, size: 18),
                  label: const Text('Hapus'),
                ),
            ],
          ),
          const SizedBox(height: 6),
          const Text(
            'JPG / PNG / WEBP, maksimal 2 MB.',
            style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF)),
          ),
        ],
      ),
    );
  }

  Widget _buildProfileCard() {
    final user = _user;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: _cardDecoration,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Informasi Akun',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: Color(0xFF111827),
            ),
          ),
          const SizedBox(height: 14),
          _buildInfoTile('Nama Lengkap', user?.fullname ?? '-'),
          _buildInfoTile('Kode Karyawan / NIK', user?.username ?? '-'),
          _buildInfoTile('Email', user?.email ?? '-'),
          _buildInfoTile('Nomor HP', user?.phone ?? '-'),
          _buildInfoTile('Divisi', user?.division?.divisionName ?? '-'),
          _buildInfoTile('Company', user?.company?.companyName ?? '-'),
        ],
      ),
    );
  }

  Widget _buildPasswordCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: _cardDecoration,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            'Ganti Password',
            style: TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w800,
              color: Color(0xFF111827),
            ),
          ),
          const SizedBox(height: 14),
          _buildPasswordField(
            controller: _currentPasswordController,
            label: 'Password Saat Ini',
            obscureText: _obscureCurrent,
            onToggle: () {
              setState(() => _obscureCurrent = !_obscureCurrent);
            },
          ),
          const SizedBox(height: 12),
          _buildPasswordField(
            controller: _newPasswordController,
            label: 'Password Baru',
            obscureText: _obscureNew,
            errorText: _newPasswordError,
            helperText: 'Minimal $_minPasswordLength karakter.',
            onToggle: () {
              setState(() => _obscureNew = !_obscureNew);
            },
          ),
          const SizedBox(height: 12),
          _buildPasswordField(
            controller: _confirmPasswordController,
            label: 'Konfirmasi Password Baru',
            obscureText: _obscureConfirm,
            errorText: _confirmPasswordError,
            onToggle: () {
              setState(() => _obscureConfirm = !_obscureConfirm);
            },
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: _isSaving ? null : _submitChangePassword,
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF111827),
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              child: _isSaving
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: Colors.white,
                      ),
                    )
                  : const Text(
                      'Simpan Password',
                      style: TextStyle(fontWeight: FontWeight.w700),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildLogoutCard() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: _cardDecoration,
      child: SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: _homeController.logout,
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFFDC2626),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          icon: const Icon(Icons.logout_rounded),
          label: const Text(
            'Logout',
            style: TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      ),
    );
  }

  Widget _buildInfoTile(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w600,
              color: Color(0xFF6B7280),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            value.trim().isEmpty ? '-' : value,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: Color(0xFF111827),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildPasswordField({
    required TextEditingController controller,
    required String label,
    required bool obscureText,
    required VoidCallback onToggle,
    String? errorText,
    String? helperText,
  }) {
    return TextField(
      controller: controller,
      obscureText: obscureText,
      onChanged: (_) => setState(() {}),
      decoration: InputDecoration(
        labelText: label,
        errorText: errorText,
        helperText: helperText,
        suffixIcon: IconButton(
          onPressed: onToggle,
          icon: Icon(
            obscureText ? Icons.visibility_off_outlined : Icons.visibility,
          ),
        ),
      ),
    );
  }
}
