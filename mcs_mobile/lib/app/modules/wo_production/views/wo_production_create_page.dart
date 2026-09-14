import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import '../controllers/wo_production_create_controller.dart';
import '../../../core/constants/app_colors.dart';

class WoProductionCreatePage extends StatelessWidget {
  const WoProductionCreatePage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final WoProductionCreateController controller = Get.put(WoProductionCreateController());

    return Scaffold(
      backgroundColor: AppColors.greyLight,
      appBar: AppBar(
        title: const Text('Buat Work Order'),
        elevation: 0,
      ),
      body: Obx(() {
        if (controller.isLoadingMaster.value) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SpinKitFadingCircle(
                  color: AppColors.primary,
                  size: 50,
                ),
                const SizedBox(height: 16),
                Text(
                  'Loading data...',
                  style: TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
          );
        }

        return Form(
          key: controller.formKey,
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _buildSectionCard(
                title: 'Informasi Dasar',
                icon: Icons.info_outline,
                children: [
                  _buildWoNumberField(controller),
                  const SizedBox(height: 16),
                  _buildDateField(controller, context),
                  const SizedBox(height: 16),
                  _buildTypeWoDropdown(controller),
                  const SizedBox(height: 16),
                  _buildPriorityDropdown(controller),
                  const SizedBox(height: 16),
                  _buildShiftDropdown(controller),
                  const SizedBox(height: 16),
                  _buildDivisionDropdown(controller),
                ],
              ),
              const SizedBox(height: 16),
              _buildSectionCard(
                title: 'Asset & Company',
                icon: Icons.business_outlined,
                children: [
                  _buildAssetSelector(controller, context),
                  const SizedBox(height: 16),
                  _buildCompanyField(controller),
                ],
              ),
              const SizedBox(height: 16),
              _buildSectionCard(
                title: 'Detail Pekerjaan',
                icon: Icons.work_outline,
                children: [
                  _buildJobTitleField(controller),
                  const SizedBox(height: 16),
                  _buildRunningHoursField(controller),
                  const SizedBox(height: 16),
                  _buildJobRequirementField(controller),
                ],
              ),
              const SizedBox(height: 16),
              _buildSectionCard(
                title: 'Attachment',
                icon: Icons.attach_file,
                children: [
                  _buildImagePicker(controller),
                ],
              ),
              const SizedBox(height: 24),
              _buildSubmitButton(controller),
              const SizedBox(height: 32),
            ],
          ),
        );
      }),
    );
  }

  Widget _buildSectionCard({
    required String title,
    required IconData icon,
    required List<Widget> children,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(icon, color: AppColors.primary, size: 20),
                ),
                const SizedBox(width: 12),
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.textPrimary,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 20),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _buildWoNumberField(WoProductionCreateController controller) {
    return TextFormField(
      controller: controller.woNumberController,
      readOnly: true,
      style: TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w500,
        color: AppColors.textSecondary,
      ),
      decoration: InputDecoration(
        labelText: 'WO Number',
        labelStyle: TextStyle(fontSize: 14, color: AppColors.textSecondary),
        prefixIcon: Icon(Icons.tag, color: AppColors.grey, size: 20),
        filled: true,
        fillColor: AppColors.greyLight,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
      ),
    );
  }

  Widget _buildDateField(WoProductionCreateController controller, BuildContext context) {
    return TextFormField(
      controller: controller.dateController,
      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        labelText: 'Tanggal',
        labelStyle: TextStyle(fontSize: 14, color: AppColors.textSecondary),
        prefixIcon: Icon(Icons.calendar_today, color: AppColors.primary, size: 20),
        filled: true,
        fillColor: AppColors.greyLight,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
      ),
      readOnly: true,
      onTap: () => controller.pickDate(context),
      validator: (value) {
        if (value == null || value.isEmpty) {
          return 'Tanggal harus diisi';
        }
        return null;
      },
    );
  }

  Widget _buildTypeWoDropdown(WoProductionCreateController controller) {
    return Obx(() => DropdownButtonFormField<String>(
      value: controller.selectedTypeWo.value,
      style: TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w500,
        color: AppColors.textPrimary,
      ),
      decoration: InputDecoration(
        labelText: 'Type WO',
        labelStyle: TextStyle(fontSize: 14, color: AppColors.textSecondary),
        prefixIcon: Icon(Icons.category, color: AppColors.primary, size: 20),
        filled: true,
        fillColor: AppColors.greyLight,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
      ),
      items: controller.woTypes.map((type) {
        return DropdownMenuItem<String>(
          value: type['code'],
          child: Text(
            type['label'],
            style: TextStyle(color: AppColors.textPrimary),
          ),
        );
      }).toList(),
      onChanged: (value) {
        if (value != null) {
          controller.selectedTypeWo.value = value;
        }
      },
    ));
  }

  Widget _buildPriorityDropdown(WoProductionCreateController controller) {
    return Obx(() => DropdownButtonFormField<String>(
      value: controller.selectedPriority.value,
      style: TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w500,
        color: AppColors.textPrimary,
      ),
      decoration: InputDecoration(
        labelText: 'Priority',
        labelStyle: TextStyle(fontSize: 14, color: AppColors.textSecondary),
        prefixIcon: Icon(Icons.priority_high, color: AppColors.primary, size: 20),
        filled: true,
        fillColor: AppColors.greyLight,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
      ),
      items: controller.priorities.map((priority) {
        return DropdownMenuItem<String>(
          value: priority['code'],
          child: Text(
            priority['label'],
            style: TextStyle(color: AppColors.textPrimary),
          ),
        );
      }).toList(),
      onChanged: (value) {
        if (value != null) {
          controller.selectedPriority.value = value;
        }
      },
    ));
  }

  Widget _buildShiftDropdown(WoProductionCreateController controller) {
    return Obx(() => DropdownButtonFormField<String>(
      value: controller.selectedShift.value,
      style: TextStyle(
        fontSize: 15,
        fontWeight: FontWeight.w500,
        color: AppColors.textPrimary,
      ),
      decoration: InputDecoration(
        labelText: 'Shift',
        labelStyle: TextStyle(fontSize: 14, color: AppColors.textSecondary),
        prefixIcon: Icon(Icons.access_time, color: AppColors.primary, size: 20),
        filled: true,
        fillColor: AppColors.greyLight,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
      ),
      items: [
        DropdownMenuItem(
          value: 'REGULAR',
          child: Text('Regular', style: TextStyle(color: AppColors.textPrimary)),
        ),
        DropdownMenuItem(
          value: 'SHIFT 1',
          child: Text('Shift 1', style: TextStyle(color: AppColors.textPrimary)),
        ),
        DropdownMenuItem(
          value: 'SHIFT 2',
          child: Text('Shift 2', style: TextStyle(color: AppColors.textPrimary)),
        ),
        DropdownMenuItem(
          value: 'SHIFT 3',
          child: Text('Shift 3', style: TextStyle(color: AppColors.textPrimary)),
        ),
      ],
      onChanged: (value) {
        if (value != null) {
          controller.selectedShift.value = value;
        }
      },
    ));
  }

  Widget _buildDivisionDropdown(WoProductionCreateController controller) {
    return Obx(() => Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.greyLight,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(Icons.corporate_fare, color: AppColors.grey, size: 20),
          const SizedBox(width: 16),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Division',
                  style: TextStyle(
                    fontSize: 14,
                    color: AppColors.textSecondary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  controller.selectedDivision.value?['division_name'] ?? 'Loading...',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                    color: AppColors.textPrimary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    ));
  }

  Widget _buildAssetSelector(WoProductionCreateController controller, BuildContext context) {
    return Obx(() => InkWell(
      onTap: () => _showAssetPicker(context, controller),
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.greyLight,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          children: [
            Icon(Icons.engineering, color: AppColors.primary, size: 20),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Asset/Equipment',
                    style: TextStyle(
                      fontSize: 14,
                      color: AppColors.textSecondary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    controller.selectedAsset.value?['AssetName'] ?? 'Pilih Asset',
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w500,
                      color: controller.selectedAsset.value == null
                          ? AppColors.textHint
                          : AppColors.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
            Icon(Icons.arrow_forward_ios, size: 16, color: AppColors.grey),
          ],
        ),
      ),
    ));
  }

  void _showAssetPicker(BuildContext context, WoProductionCreateController controller) {
    final searchController = TextEditingController();
    final filteredAssets = <Map<String, dynamic>>[].obs;
    
    filteredAssets.value = controller.assets;
    
    void filterAssets(String query) {
      if (query.isEmpty) {
        filteredAssets.value = controller.assets;
      } else {
        filteredAssets.value = controller.assets.where((asset) {
          final assetId = asset['AssetID']?.toString().toLowerCase() ?? '';
          final assetCode = asset['AssetCode']?.toString().toLowerCase() ?? '';
          final assetName = asset['AssetName']?.toString().toLowerCase() ?? '';
          final searchQuery = query.toLowerCase();
          
          return assetId.contains(searchQuery) ||
                 assetCode.contains(searchQuery) ||
                 assetName.contains(searchQuery);
        }).toList();
      }
    }
    
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) {
        return Container(
          height: MediaQuery.of(context).size.height * 0.75,
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  border: Border(
                    bottom: BorderSide(color: AppColors.greyLight, width: 1),
                  ),
                ),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            'Pilih Asset',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.bold,
                              color: AppColors.textPrimary,
                            ),
                          ),
                        ),
                        IconButton(
                          icon: const Icon(Icons.close),
                          onPressed: () => Get.back(),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: searchController,
                      decoration: InputDecoration(
                        hintText: 'Cari asset...',
                        hintStyle: TextStyle(fontSize: 14, color: AppColors.textHint),
                        prefixIcon: Icon(Icons.search, color: AppColors.grey, size: 20),
                        filled: true,
                        fillColor: AppColors.greyLight,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide.none,
                        ),
                        contentPadding: const EdgeInsets.symmetric(
                          vertical: 12,
                          horizontal: 16,
                        ),
                      ),
                      onChanged: filterAssets,
                    ),
                  ],
                ),
              ),
              Expanded(
                child: Obx(() {
                  if (controller.assets.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.inbox, size: 64, color: AppColors.grey),
                          const SizedBox(height: 16),
                          Text(
                            'Pilih Division terlebih dahulu',
                            style: TextStyle(color: AppColors.textSecondary),
                          ),
                        ],
                      ),
                    );
                  }
                  
                  if (filteredAssets.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(Icons.search_off, size: 64, color: AppColors.grey),
                          const SizedBox(height: 16),
                          Text(
                            'Asset tidak ditemukan',
                            style: TextStyle(color: AppColors.textSecondary),
                          ),
                        ],
                      ),
                    );
                  }
                  
                  return ListView.separated(
                    itemCount: filteredAssets.length,
                    separatorBuilder: (context, index) => Divider(
                      height: 1,
                      color: AppColors.greyLight,
                    ),
                    itemBuilder: (context, index) {
                      final asset = filteredAssets[index];
                      return ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                          horizontal: 20,
                          vertical: 8,
                        ),
                        leading: Container(
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Icon(
                            Icons.precision_manufacturing,
                            color: AppColors.primary,
                            size: 24,
                          ),
                        ),
                        title: Text(
                          asset['AssetName'] ?? '',
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                            color: AppColors.textPrimary,
                          ),
                        ),
                        subtitle: Text(
                          '${asset['AssetCode']} | ID: ${asset['AssetID']}',
                          style: TextStyle(
                            fontSize: 13,
                            color: AppColors.textSecondary,
                          ),
                        ),
                        trailing: Icon(
                          Icons.arrow_forward_ios,
                          size: 16,
                          color: AppColors.grey,
                        ),
                        onTap: () {
                          controller.selectedAsset.value = asset;
                          Get.back();
                        },
                      );
                    },
                  );
                }),
              ),
            ],
          ),
        );
      },
    ).whenComplete(() {
      searchController.dispose();
    });
  }

  Widget _buildCompanyField(WoProductionCreateController controller) {
    return TextFormField(
      controller: controller.companyController,
      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        labelText: 'Company',
        labelStyle: TextStyle(fontSize: 14, color: AppColors.textSecondary),
        prefixIcon: Icon(Icons.business, color: AppColors.primary, size: 20),
        filled: true,
        fillColor: AppColors.greyLight,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
      ),
    );
  }

  Widget _buildJobTitleField(WoProductionCreateController controller) {
    return TextFormField(
      controller: controller.jobTitleController,
      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        labelText: 'Job Title',
        labelStyle: TextStyle(fontSize: 14, color: AppColors.textSecondary),
        prefixIcon: Icon(Icons.title, color: AppColors.primary, size: 20),
        filled: true,
        fillColor: AppColors.greyLight,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
      ),
      maxLines: 2,
      validator: (value) {
        if (value == null || value.isEmpty) {
          return 'Job Title harus diisi';
        }
        return null;
      },
    );
  }

  Widget _buildRunningHoursField(WoProductionCreateController controller) {
    return TextFormField(
      controller: controller.runningHoursController,
      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        labelText: 'Running Hours',
        labelStyle: TextStyle(fontSize: 14, color: AppColors.textSecondary),
        prefixIcon: Icon(Icons.speed, color: AppColors.primary, size: 20),
        filled: true,
        fillColor: AppColors.greyLight,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.primary, width: 2),
        ),
        contentPadding: const EdgeInsets.symmetric(vertical: 16, horizontal: 16),
      ),
      keyboardType: TextInputType.number,
    );
  }

  Widget _buildJobRequirementField(WoProductionCreateController controller) {
    return TextFormField(
      controller: controller.jobRequirementController,
      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        labelText: 'Job Requirement',
        labelStyle: TextStyle(fontSize: 14, color: AppColors.textSecondary),
        alignLabelWithHint: true,
        filled: true,
        fillColor: AppColors.greyLight,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: AppColors.primary, width: 2),
        ),
        contentPadding: const EdgeInsets.all(16),
      ),
      maxLines: 4,
    );
  }

  Widget _buildImagePicker(WoProductionCreateController controller) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Icon(Icons.attach_file, size: 18, color: AppColors.textSecondary),
            const SizedBox(width: 8),
            Text(
              'Upload Foto (Optional)',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.textSecondary,
              ),
            ),
            const Spacer(),
            Text(
              'Max 5 foto',
              style: TextStyle(
                fontSize: 12,
                color: AppColors.textHint,
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        Obx(() => Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            ...controller.selectedImages.asMap().entries.map((entry) {
              return Stack(
                children: [
                  Container(
                    width: 90,
                    height: 90,
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      image: DecorationImage(
                        image: FileImage(entry.value),
                        fit: BoxFit.cover,
                      ),
                    ),
                  ),
                  Positioned(
                    top: 4,
                    right: 4,
                    child: GestureDetector(
                      onTap: () => controller.removeImage(entry.key),
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: Colors.red,
                          shape: BoxShape.circle,
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withOpacity(0.2),
                              blurRadius: 4,
                            ),
                          ],
                        ),
                        child: const Icon(
                          Icons.close,
                          size: 16,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
                ],
              );
            }),
            if (controller.selectedImages.length < 5)
              GestureDetector(
                onTap: controller.pickImages,
                child: Container(
                  width: 90,
                  height: 90,
                  decoration: BoxDecoration(
                    color: AppColors.greyLight,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: AppColors.grey,
                      width: 2,
                      style: BorderStyle.solid,
                    ),
                  ),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(
                        Icons.add_photo_alternate,
                        color: AppColors.primary,
                        size: 32,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Tambah',
                        style: TextStyle(
                          fontSize: 11,
                          color: AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
          ],
        )),
      ],
    );
  }

  Widget _buildSubmitButton(WoProductionCreateController controller) {
    return Obx(() => Container(
      height: 56,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        gradient: LinearGradient(
          colors: controller.isLoading.value
              ? [AppColors.grey, AppColors.grey]
              : [AppColors.primary, AppColors.primaryDark],
        ),
        boxShadow: controller.isLoading.value
            ? []
            : [
                BoxShadow(
                  color: AppColors.primary.withOpacity(0.3),
                  blurRadius: 12,
                  offset: const Offset(0, 4),
                ),
              ],
      ),
      child: ElevatedButton(
        onPressed: controller.isLoading.value ? null : controller.submitWo,
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.transparent,
          shadowColor: Colors.transparent,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
          ),
        ),
        child: controller.isLoading.value
            ? Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  SpinKitThreeBounce(
                    color: Colors.white,
                    size: 20,
                  ),
                  const SizedBox(width: 12),
                  const Text(
                    'Memproses...',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ],
              )
            : Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: const [
                  Icon(Icons.check_circle_outline, size: 24),
                  SizedBox(width: 12),
                  Text(
                    'Buat Work Order',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
      ),
    ));
  }
}
