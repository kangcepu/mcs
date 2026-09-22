import 'dart:io';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import '../controllers/wo_detail_controller.dart';
import '../../../core/constants/api_constants.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/utils/app_date_format_helper.dart';
import '../../../core/utils/company_label_helper.dart';
import '../../../core/widgets/status_badge.dart';
import '../../../core/widgets/custom_card.dart';
import '../../../core/widgets/wo_material_dialog.dart';
import '../../../core/utils/media_picker_helper.dart';
import '../../../core/widgets/video_player_page.dart';
import 'package:multi_select_flutter/multi_select_flutter.dart';

class WoGaDetailPage extends StatelessWidget {
  const WoGaDetailPage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final WoGaDetailController controller = Get.put(WoGaDetailController());

    return Scaffold(
      appBar: AppBar(
        title: const Text('Detail Work Order'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: controller.refresh,
          ),
        ],
      ),
      body: Obx(() {
        if (controller.isLoading.value) {
          return Center(
            child: SpinKitFadingCircle(
              color: AppColors.primary,
              size: 50,
            ),
          );
        }

        if (controller.woDetail.value == null) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.error_outline, size: 64, color: AppColors.grey),
                const SizedBox(height: 16),
                Text(
                  'Data tidak ditemukan',
                  style:
                      TextStyle(fontSize: 16, color: AppColors.textSecondary),
                ),
              ],
            ),
          );
        }

        return Stack(
          children: [
            RefreshIndicator(
              onRefresh: controller.refresh,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _buildHeaderCard(controller),
                      _buildDetailsCard(controller),
                      _buildServicePhotosCard(controller),
                      _buildExecutorsCard(controller),
                      if (controller.labor.isNotEmpty)
                        _buildLaborCard(controller),
                      if (controller.material.isNotEmpty ||
                          controller.materialRequests.isNotEmpty)
                        _buildMaterialCard(controller),
                      SizedBox(height: controller.hasAnyPermission ? 200 : 80),
                    ],
                  ),
                ),
              ),
            ),
            Obx(() {
              if (controller.isLoading.value) return const SizedBox();

              return Positioned(
                bottom: 0,
                left: 0,
                right: 0,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withOpacity(0.1),
                        blurRadius: 10,
                        offset: const Offset(0, -2),
                      ),
                    ],
                  ),
                  child: SafeArea(
                    top: false,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        _buildStatusMessage(controller),
                        if (controller.hasAnyPermission)
                          _buildActionButtons(controller, context),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ],
        );
      }),
    );
  }

  Widget _buildActionButtons(
      WoGaDetailController controller, BuildContext context) {
    return Card(
      elevation: 8,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (controller.canApprove) ...[
              ElevatedButton.icon(
                onPressed: () => _showApproveDialog(context, controller),
                icon: const Icon(Icons.check_circle),
                label: const Text('Approve'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 48),
                ),
              ),
              const SizedBox(height: 8),
            ],
            if (controller.canExecute) ...[
              ElevatedButton.icon(
                onPressed: () => _showJobExplanationDialog(context, controller),
                icon: const Icon(Icons.description),
                label: const Text('Update Progress'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 48),
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () => _showAddLaborDialog(context, controller),
                      icon: const Icon(Icons.person_add),
                      label: const Text('Labor'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.orange,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton.icon(
                      onPressed: () =>
                          _showAddMaterialDialog(context, controller),
                      icon: const Icon(Icons.inventory),
                      label: const Text('Material'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.purple,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ),
                ],
              ),
            ],
            if (controller.canComplete) ...[
              const SizedBox(height: 8),
              ElevatedButton.icon(
                onPressed: () => _showCompleteDialog(context, controller),
                icon: const Icon(Icons.done_all),
                label: const Text('Complete'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.blue,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 48),
                ),
              ),
            ],
            if (controller.canClose) ...[
              ElevatedButton.icon(
                onPressed: () => _showCloseDialog(context, controller),
                icon: const Icon(Icons.close_fullscreen),
                label: const Text('Close WO'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                  foregroundColor: Colors.white,
                  minimumSize: const Size(double.infinity, 48),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  void _showApproveDialog(BuildContext context, WoGaDetailController controller) {
    final commentController = TextEditingController();

    Get.dialog(
      AlertDialog(
        title: const Text('Approve Work Order'),
        content: TextField(
          controller: commentController,
          decoration: const InputDecoration(
            labelText: 'Comment',
            border: OutlineInputBorder(),
          ),
          maxLines: 3,
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Get.back();
              controller.approveWo(commentController.text);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
            child: const Text('Approve'),
          ),
        ],
      ),
    );
  }

  void _showJobExplanationDialog(
      BuildContext context, WoGaDetailController controller) {
    final explanationController = TextEditingController();
    final List<File> selectedServicePhotos = [];
    String selectedStatus = 'IN_PROGRESS';
    const maxServicePhotos = 5;

    Get.dialog(
      StatefulBuilder(
        builder: (context, setState) {
          Future<void> pickServicePhotoFromCamera() async {
            final file = await MediaPickerHelper.pickImageFromCamera();
            if (file != null) {
              setState(() {
                if (selectedServicePhotos.length >= maxServicePhotos) {
                  Get.snackbar('Limit', 'Maksimal $maxServicePhotos foto');
                  return;
                }
                selectedServicePhotos.add(file);
              });
            }
          }

          Future<void> pickServicePhotoFromGallery() async {
            final files = await MediaPickerHelper.pickMultiImageFromGallery();
            if (files.isNotEmpty) {
              setState(() {
                final available =
                    maxServicePhotos - selectedServicePhotos.length;
                if (available <= 0) {
                  Get.snackbar('Limit', 'Maksimal $maxServicePhotos foto');
                  return;
                }
                if (files.length > available) {
                  Get.snackbar('Limit',
                      'Maksimal $maxServicePhotos foto (sisanya diabaikan)');
                }
                selectedServicePhotos.addAll(files.take(available));
              });
            }
          }

          void addServiceVideo(File video) {
            if (selectedServicePhotos.length >= maxServicePhotos) {
              Get.snackbar('Limit', 'Maksimal $maxServicePhotos file');
              return;
            }
            setState(() => selectedServicePhotos.add(video));
          }

          Future<void> pickServiceVideoFromCamera() async {
            final video = await MediaPickerHelper.pickVideoFromCamera();
            if (video != null) addServiceVideo(video);
          }

          Future<void> pickServiceVideoFromGallery() async {
            final video = await MediaPickerHelper.pickVideoFromGallery();
            if (video != null) addServiceVideo(video);
          }

          void showServiceVideoOptions() {
            Get.bottomSheet(
              SafeArea(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    ListTile(
                      leading: const Icon(Icons.videocam),
                      title: const Text('Rekam Video'),
                      onTap: () {
                        Get.back();
                        pickServiceVideoFromCamera();
                      },
                    ),
                    ListTile(
                      leading: const Icon(Icons.video_library),
                      title: const Text('Pilih Video Galeri'),
                      onTap: () {
                        Get.back();
                        pickServiceVideoFromGallery();
                      },
                    ),
                  ],
                ),
              ),
            );
          }

          return AlertDialog(
            title: const Text('Update Progress'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: explanationController,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      labelText: 'Job Explanation',
                      border: OutlineInputBorder(),
                      hintText: 'Masukkan progress pekerjaan...',
                    ),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    value: selectedStatus,
                    decoration: const InputDecoration(
                      labelText: 'Status',
                      border: OutlineInputBorder(),
                    ),
                    items: const [
                      DropdownMenuItem(
                          value: 'IN_PROGRESS', child: Text('IN PROGRESS')),
                      DropdownMenuItem(
                          value: 'COMPLETE', child: Text('COMPLETE')),
                    ],
                    onChanged: (value) {
                      setState(() {
                        selectedStatus = value!;
                      });
                    },
                  ),
                  const SizedBox(height: 16),
                  const Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      'Bukti Foto/Video Service (Wajib)',
                      style: TextStyle(fontWeight: FontWeight.w600),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: pickServicePhotoFromCamera,
                          icon: const Icon(Icons.photo_camera),
                          label: const Text('Camera'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: pickServicePhotoFromGallery,
                          icon: const Icon(Icons.photo_library),
                          label: const Text('Gallery'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: showServiceVideoOptions,
                      icon: const Icon(Icons.videocam),
                      label: const Text('Video'),
                    ),
                  ),
                  const SizedBox(height: 8),
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Text(
                      '${selectedServicePhotos.length} file dipilih',
                      style: TextStyle(
                        color: selectedServicePhotos.isEmpty
                            ? Colors.red
                            : Colors.green,
                        fontSize: 12,
                      ),
                    ),
                  ),
                  if (selectedServicePhotos.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children:
                          List.generate(selectedServicePhotos.length, (index) {
                        final file = selectedServicePhotos[index]
                            .path
                            .split(RegExp(r'[\\/]'))
                            .last;
                        return InputChip(
                          label: Text(file, overflow: TextOverflow.ellipsis),
                          onDeleted: () {
                            setState(() {
                              selectedServicePhotos.removeAt(index);
                            });
                          },
                        );
                      }),
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Get.back(),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () {
                  if (explanationController.text.isEmpty) {
                    Get.snackbar('Error', 'Job explanation harus diisi');
                    return;
                  }
                  if (selectedServicePhotos.isEmpty) {
                    Get.snackbar('Error', 'Bukti foto/video service wajib diupload');
                    return;
                  }
                  Get.back();
                  controller.addJobExplanation(
                    explanationController.text,
                    selectedStatus,
                    servicePhotoPaths:
                        selectedServicePhotos.map((e) => e.path).toList(),
                  );
                },
                child: const Text('Submit'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _showAddLaborDialog(
      BuildContext context, WoGaDetailController controller) async {
    List<String> picOptions = [];
    try {
      picOptions = await controller.getLaborPicOptions();
    } catch (e) {
      Get.snackbar(
        'Warning',
        'Daftar PIC belum bisa dimuat, gunakan input manual',
        snackPosition: SnackPosition.BOTTOM,
      );
    }

    String? selectedPic = picOptions.isNotEmpty ? picOptions.first : null;
    final tradeController = TextEditingController(text: selectedPic ?? '');
    final menController = TextEditingController(text: '1');
    final hoursController = TextEditingController(text: '1');

    List<String> selectedPics = [];

    Get.dialog(
      StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: const Text('Add Labor'),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (picOptions.isNotEmpty)
                  MultiSelectDialogField<String>(
                    title: const Text("Pilih PIC"),
                    searchable: true,
                    items: picOptions
                        .map((e) => MultiSelectItem<String>(e, e))
                        .toList(),
                    initialValue: selectedPics,
                    buttonText: const Text("Pilih PIC"),
                    onConfirm: (values) {
                      if (values.length > 10) {
                        Get.snackbar("Warning", "Maksimal 10 user");
                        return;
                      }

                      setState(() {
                        selectedPics = values;
                        tradeController.text = values.join(",");
                      });
                    },
                    chipDisplay: MultiSelectChipDisplay(
                      onTap: (value) {
                        setState(() {
                          selectedPics.remove(value);
                          tradeController.text = selectedPics.join(",");
                        });
                      },
                    ),
                  )
                else
                  TextField(
                    controller: tradeController,
                    decoration: const InputDecoration(
                      labelText: 'PIC',
                      border: OutlineInputBorder(),
                    ),
                  ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: menController,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Men',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: hoursController,
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        decoration: const InputDecoration(
                          labelText: 'Hours',
                          border: OutlineInputBorder(),
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
            actions: [
              TextButton(
                onPressed: () => Get.back(),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: () {
                  final picRaw = tradeController.text.trim();
                  final pics = picRaw
                      .split(',')
                      .map((value) => value.trim())
                      .where((value) => value.isNotEmpty)
                      .toSet()
                      .toList();
                  if (pics.isEmpty) {
                    Get.snackbar('Error', 'PIC harus dipilih');
                    return;
                  }
                  if (pics.length > 10) {
                    Get.snackbar('Error', 'Maksimal 10 PIC');
                    return;
                  }
                  Get.back();
                  controller.addLabor(
                    pics.join(','),
                    int.tryParse(menController.text) ?? 1,
                    double.tryParse(
                          hoursController.text.trim().replaceAll(',', '.'),
                        ) ??
                        1,
                  );
                },
                child: const Text('Add'),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showAddMaterialDialog(
      BuildContext context, WoGaDetailController controller) {
    WoMaterialDialog.show(
      title: 'Add Material',
      onSearchMaterial: controller.searchMaterialSuggestions,
      onGetMaterialUom: controller.getMaterialUom,
    ).then((result) {
      if (result == null) {
        return;
      }
      controller.addMaterial(
        result.material,
        result.qty,
        result.unit,
        result.pr,
      );
    });
  }

  void _showCompleteDialog(
      BuildContext context, WoGaDetailController controller) {
    final commentController = TextEditingController();

    Get.dialog(
      AlertDialog(
        title: const Text('Complete Work Order'),
        content: TextField(
          controller: commentController,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Comment',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Get.back();
              controller.completeWo(commentController.text);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.blue),
            child: const Text('Complete'),
          ),
        ],
      ),
    );
  }

  void _showCloseDialog(BuildContext context, WoGaDetailController controller) {
    final commentController = TextEditingController();

    Get.dialog(
      AlertDialog(
        title: const Text('Close Work Order'),
        content: TextField(
          controller: commentController,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Comment',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Get.back(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              Get.back();
              controller.closeWo(commentController.text);
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Widget _buildStatusMessage(WoGaDetailController controller) {
    final status = controller.woHeader['status'] ?? '';

    String message = '';
    Color bgColor = Colors.blue;
    IconData icon = Icons.info_outline;

    if (status.contains('WAIT_EXECUTOR') || status == 'WAIT_EXECUTOR_ADMIN') {
      message = 'Menunggu executor untuk memulai pekerjaan';
      bgColor = Colors.orange;
      icon = Icons.hourglass_empty;
    } else if (status.contains('IN_PROGRESS') ||
        status == 'COMPLETE_EXECUTOR') {
      message = 'Pekerjaan sedang dalam pengerjaan oleh executor';
      bgColor = Colors.blue;
      icon = Icons.engineering;
    } else if (status.contains('WAIT_KA')) {
      message = 'Menunggu approval dari atasan';
      bgColor = Colors.amber;
      icon = Icons.pending_actions;
    } else if (status == 'NEED_CLOSED') {
      message = 'Menunggu penutupan oleh Kadiv';
      bgColor = Colors.green;
      icon = Icons.task_alt;
    } else if (status == 'CLOSED') {
      return const SizedBox();
    } else {
      return const SizedBox();
    }

    return Card(
      color: bgColor.withOpacity(0.9),
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Icon(icon, color: Colors.white, size: 24),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                message,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeaderCard(WoGaDetailController controller) {
    final header = controller.woHeader;

    return CustomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Expanded(
                child: Text(
                  header['wo_number'] ?? '',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: AppColors.primary,
                  ),
                ),
              ),
              StatusBadge(status: header['status'] ?? ''),
            ],
          ),
          const SizedBox(height: 16),
          Text(
            header['job_title'] ?? '',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 16),
          _buildInfoRow(
            Icons.business,
            shortCompanyLabel(header['company']?.toString()),
          ),
          const SizedBox(height: 8),
          _buildInfoRow(
              Icons.calendar_today, _formatDate(header['date'] ?? '')),
          const SizedBox(height: 8),
          _buildInfoRow(Icons.person, 'Creator: ${header['creator'] ?? '-'}'),
        ],
      ),
    );
  }

  Widget _buildDetailsCard(WoGaDetailController controller) {
    final header = controller.woHeader;

    return CustomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Detail Pekerjaan',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 16),
          _buildDetailRow('Tipe WO', header['type_wo'] ?? '-'),
          _buildDetailRow('Division', header['division_name'] ?? '-'),
          _buildDetailRow('Asset', header['AssetName'] ?? '-'),
          const SizedBox(height: 12),
          Text(
            'Problem:',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            header['job_requirement'] ?? '-',
            style: TextStyle(
              fontSize: 14,
              color: AppColors.textPrimary,
            ),
          ),
          if (header['job_explanation'] != null &&
              header['job_explanation'].toString().isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(
              'Job Explanation:',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              header['job_explanation'] ?? '',
              style: TextStyle(
                fontSize: 14,
                color: AppColors.textPrimary,
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildServicePhotosCard(WoGaDetailController controller) {
    return Obx(() {
      final raw = controller.woDetail.value?['service_photos'];
      if (raw is! List || raw.isEmpty) return const SizedBox();

      final items = raw
          .whereType<Map>()
          .map((e) => Map<String, dynamic>.from(e))
          .where((e) => (e['url'] ?? '').toString().trim().isNotEmpty)
          .toList(growable: false);

      if (items.isEmpty) return const SizedBox();

      return CustomCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    'Bukti Foto/Video Service',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.greyLight,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '${items.length}',
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SizedBox(
              height: 110,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(width: 12),
                itemBuilder: (context, index) {
                  final url =
                      ApiConstants.mediaUrl(items[index]['url']?.toString());
                  final isVideo = MediaPickerHelper.isVideo(url);
                  return InkWell(
                    onTap: () => isVideo
                        ? Get.to(() => VideoPlayerPage(
                              title: items[index]['name']?.toString() ??
                                  'Video',
                              networkUrl: url,
                            ))
                        : _showImagePreview(url),
                    borderRadius: BorderRadius.circular(12),
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: AspectRatio(
                        aspectRatio: 1.3,
                        child: isVideo
                            ? Container(
                                color: Colors.black87,
                                child: const Center(
                                  child: Icon(
                                    Icons.play_circle_fill,
                                    color: Colors.white,
                                    size: 36,
                                  ),
                                ),
                              )
                            : Image.network(
                                url,
                                fit: BoxFit.cover,
                                errorBuilder: (_, __, ___) => Container(
                                  color: AppColors.greyLight,
                                  child: const Center(
                                    child: Icon(Icons.broken_image),
                                  ),
                                ),
                                loadingBuilder: (context, child, progress) {
                                  if (progress == null) return child;
                                  return Container(
                                    color: AppColors.greyLight,
                                    child: const Center(
                                      child: CircularProgressIndicator(),
                                    ),
                                  );
                                },
                              ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      );
    });
  }

  void _showImagePreview(String url) {
    final safeUrl = url.trim();
    if (safeUrl.isEmpty) return;

    Get.dialog(
      Dialog(
        backgroundColor: Colors.transparent,
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Container(
            color: Colors.black,
            child: InteractiveViewer(
              minScale: 0.8,
              maxScale: 4,
              child: Image.network(
                safeUrl,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const SizedBox(
                  height: 220,
                  child: Center(
                    child: Text(
                      'Gagal memuat gambar',
                      style: TextStyle(color: Colors.white),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildExecutorsCard(WoGaDetailController controller) {
    final executors = controller.executors;

    return CustomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Executor',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          if (executors.isEmpty)
            Text(
              'Belum ada executor',
              style: TextStyle(color: AppColors.textSecondary),
            )
          else
            ...executors.map((executor) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Icon(Icons.person,
                          size: 16, color: AppColors.textSecondary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          executor['job_executor'] ?? '',
                          style: TextStyle(
                            fontSize: 14,
                            color: AppColors.textPrimary,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.info.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          executor['status'] ?? '',
                          style: TextStyle(
                            fontSize: 11,
                            color: AppColors.info,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                )),
        ],
      ),
    );
  }

  Widget _buildLaborCard(WoGaDetailController controller) {
    final labor = controller.labor;

    return CustomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Labor',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          ...labor.map((item) {
            final String tradeText;
            final String menHoursText;

            if (item is Map) {
              tradeText = (item['trade'] ?? '-').toString();
              final men = (item['men'] ?? 0).toString();
              final hours = (item['hours'] ?? 0).toString();
              menHoursText = '$men men | $hours h';
            } else {
              tradeText = item.toString();
              menHoursText = '';
            }

            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      tradeText.isEmpty ? '-' : tradeText,
                      style: TextStyle(
                        fontSize: 14,
                        color: AppColors.textPrimary,
                      ),
                    ),
                  ),
                  if (menHoursText.isNotEmpty)
                    Text(
                      menHoursText,
                      style: TextStyle(
                        fontSize: 13,
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                ],
              ),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildMaterialCard(WoGaDetailController controller) {
    final material = controller.material;
    final materialRequests = controller.materialRequests;

    return CustomCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Material',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: 12),
          if (material.isNotEmpty) ...[
            ...material.map((item) {
              final String materialName;
              final String qtyText;

              if (item is Map) {
                materialName = (item['material'] ?? '-').toString();
                final qty = (item['qty'] ?? 0).toString();
                final unit = (item['unit'] ?? '').toString();
                qtyText = '$qty $unit'.trim();
              } else {
                materialName = item.toString();
                qtyText = '';
              }

              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        materialName.isEmpty ? '-' : materialName,
                        style: TextStyle(
                          fontSize: 14,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                    if (qtyText.isNotEmpty)
                      Text(
                        qtyText,
                        style: TextStyle(
                          fontSize: 13,
                          color: AppColors.textSecondary,
                          fontWeight: FontWeight.w500,
                        ),
                      ),
                  ],
                ),
              );
            }),
          ],
          if (materialRequests.isNotEmpty) ...[
            if (material.isNotEmpty) const Divider(height: 20),
            Text(
              'Material Request / Receive',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: AppColors.textSecondary,
              ),
            ),
            const SizedBox(height: 8),
            ...materialRequests.map((item) {
              if (item is! Map) {
                final text = item.toString().trim();
                return Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Text(
                    text.isEmpty ? '-' : text,
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.textSecondary,
                    ),
                  ),
                );
              }

              final part = (item['part'] ?? '-').toString();
              final reqQty = (item['material_request'] ?? 0).toString();
              final reqUom = (item['uom_request'] ?? '').toString();
              final recQty = (item['material_receive'] ?? 0).toString();
              final recUom =
                  ((item['uom_receive'] ?? item['uom_request']) ?? '')
                      .toString();
              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      part,
                      style: TextStyle(
                        fontSize: 14,
                        color: AppColors.textPrimary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Request: $reqQty $reqUom',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                    Text(
                      'Receive: $recQty $recUom',
                      style: TextStyle(
                        fontSize: 12,
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                ),
              );
            }),
          ],
          if (material.isEmpty && materialRequests.isEmpty)
            Text(
              'No material records',
              style: TextStyle(color: AppColors.textSecondary),
            ),
        ],
      ),
    );
  }

  Widget _buildInfoRow(IconData icon, String text) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AppColors.textSecondary),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            text,
            style: TextStyle(
              fontSize: 14,
              color: AppColors.textSecondary,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildDetailRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 120,
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                color: AppColors.textSecondary,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                fontSize: 14,
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _formatDate(String date) {
    return formatDisplayDate(date);
  }
}

