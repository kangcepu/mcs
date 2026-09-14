import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:flutter_spinkit/flutter_spinkit.dart';
import '../controllers/wo_create_controller.dart';
import '../../../core/constants/app_colors.dart';

class WoCreatePage extends StatelessWidget {
  const WoCreatePage({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final WoCreateController controller = Get.put(WoCreateController());

    return Scaffold(
      backgroundColor: Colors.grey[50],
      appBar: AppBar(
        title: const Text(
          'Create Work Order',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600),
        ),
        elevation: 0,
        actions: [
          Obx(() => controller.isSubmitting.value
              ? const Padding(
                  padding: EdgeInsets.all(16),
                  child: SizedBox(
                    width: 24,
                    height: 24,
                    child: CircularProgressIndicator(
                      strokeWidth: 2.5,
                      color: Colors.white,
                    ),
                  ),
                )
              : IconButton(
                  icon: const Icon(Icons.check_rounded, size: 26),
                  onPressed: controller.submitWo,
                  tooltip: 'Submit',
                )),
        ],
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

        return Stack(
          children: [
            Form(
              key: controller.formKey,
              child: ListView(
                padding: const EdgeInsets.all(20),
                children: [
                  _buildSectionCard(
                    title: 'Basic Information',
                    icon: Icons.info_outline,
                    children: [
                      _buildWoNumberField(controller),
                      const SizedBox(height: 16),
                      _buildDateField(controller, context),
                      const SizedBox(height: 16),
                      _buildDivisionDropdown(controller),
                      const SizedBox(height: 16),
                      _buildAssetSelector(controller, context),
                      const SizedBox(height: 16),
                      _buildCompanyField(controller),
                    ],
                  ),
                  const SizedBox(height: 20),
                  _buildSectionCard(
                    title: 'Work Order Details',
                    icon: Icons.settings_outlined,
                    children: [
                      _buildTypeWoDropdown(controller),
                      const SizedBox(height: 16),
                      _buildPriorityDropdown(controller),
                      const SizedBox(height: 16),
                      _buildShiftDropdown(controller),
                      _buildJobTitleField(controller),
                      const SizedBox(height: 16),
                      _buildRunningHoursField(controller),
                      const SizedBox(height: 16),
                      _buildJobRequirementField(controller),
                    ],
                  ),
                  const SizedBox(height: 20),
                  _buildSectionCard(
                    title: 'Attachments',
                    icon: Icons.attach_file,
                    children: [
                      _buildImagePicker(controller),
                    ],
                  ),
                  const SizedBox(height: 100),
                ],
              ),
            ),
            if (controller.isSubmitting.value)
              Container(
                color: Colors.black45,
                child: Center(
                  child: Card(
                    elevation: 8,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: const Padding(
                      padding: EdgeInsets.all(32),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          CircularProgressIndicator(strokeWidth: 3),
                          SizedBox(height: 20),
                          Text('Creating Work Order...',
                              style: TextStyle(
                                  fontSize: 16, fontWeight: FontWeight.w600)),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      }),
    );
  }

  Widget _buildSectionCard({
    required String title,
    required IconData icon,
    required List<Widget> children,
  }) {
    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
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
                  style: const TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.2,
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

  Widget _buildWoNumberField(WoCreateController controller) {
    return Obx(() => TextFormField(
          controller: controller.woNumberController,
          readOnly: true,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
          ),
          decoration: InputDecoration(
            labelText: 'WO Number',
            labelStyle: const TextStyle(fontSize: 14),
            prefixIcon: const Icon(Icons.tag, size: 22),
            suffixIcon: controller.isGeneratingNumber.value
                ? const Padding(
                    padding: EdgeInsets.all(12.0),
                    child: SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(strokeWidth: 2.5),
                    ),
                  )
                : IconButton(
                    icon: const Icon(Icons.refresh_rounded),
                    onPressed: controller.generateWoNumber,
                    tooltip: 'Generate',
                  ),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            filled: true,
            fillColor: Colors.grey[50],
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          ),
        ));
  }

  Widget _buildDateField(WoCreateController controller, BuildContext context) {
    return TextFormField(
      controller: controller.dateController,
      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        labelText: 'Date *',
        labelStyle: const TextStyle(fontSize: 14),
        prefixIcon: const Icon(Icons.calendar_today, size: 20),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: Colors.grey[50],
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      readOnly: true,
      onTap: () => controller.pickDate(context),
      validator: (value) {
        if (value == null || value.isEmpty) {
          return 'Date harus diisi';
        }
        return null;
      },
    );
  }

  Widget _buildTypeWoDropdown(WoCreateController controller) {
    return Obx(() => DropdownButtonFormField<String>(
          value: controller.selectedTypeWo.value.trim().isNotEmpty
              ? controller.selectedTypeWo.value
              : null,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
            color: Colors.black87,
          ),
          decoration: InputDecoration(
            labelText: 'Type WO *',
            labelStyle: const TextStyle(fontSize: 14),
            prefixIcon: const Icon(Icons.category, size: 22),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            filled: true,
            fillColor: Colors.grey[50],
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          ),
          hint: const Text('Select Type WO'),
          items: controller.woTypes.map((type) {
            final code = (type['code'] ?? '').toString();
            return DropdownMenuItem<String>(
              value: code,
              child: Text(
                _normalizeTypeWoLabel(code, (type['label'] ?? '').toString()),
              ),
            );
          }).toList(),
          onChanged: (value) {
            if (value != null) {
              controller.selectedTypeWo.value = value;
            }
          },
          validator: (value) {
            if (value == null || value.trim().isEmpty) {
              return 'Type WO harus dipilih';
            }
            return null;
          },
        ));
  }

  Widget _buildPriorityDropdown(WoCreateController controller) {
    return Obx(() => DropdownButtonFormField<String>(
          value: controller.selectedPriority.value.trim().isNotEmpty
              ? controller.selectedPriority.value
              : null,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
            color: Colors.black87,
          ),
          decoration: InputDecoration(
            labelText: 'Priority *',
            labelStyle: const TextStyle(fontSize: 14),
            prefixIcon: const Icon(Icons.priority_high, size: 22),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            filled: true,
            fillColor: Colors.grey[50],
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          ),
          hint: const Text('Select Priority'),
          items: controller.priorities.map((priority) {
            final code = (priority['code'] ?? '').toString();
            final label = (priority['label'] ?? code).toString();
            return DropdownMenuItem<String>(
              value: code,
              child: Row(
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: _getPriorityColor(code),
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Text(label),
                ],
              ),
            );
          }).toList(),
          onChanged: (value) {
            if (value != null) {
              controller.selectedPriority.value = value;
            }
          },
          validator: (value) {
            if (value == null || value.trim().isEmpty) {
              return 'Priority harus dipilih';
            }
            return null;
          },
        ));
  }

  Widget _buildShiftDropdown(WoCreateController controller) {
    return Obx(() => DropdownButtonFormField<String>(
          value: controller.selectedShift.value.trim().isNotEmpty
              ? controller.selectedShift.value
              : null,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w500,
            color: Colors.black87,
          ),
          decoration: InputDecoration(
            labelText: 'Shift',
            labelStyle: const TextStyle(fontSize: 14),
            prefixIcon: const Icon(Icons.access_time, size: 22),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            filled: true,
            fillColor: Colors.grey[50],
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          ),
          hint: const Text('Select Shift'),
          items: const [
            DropdownMenuItem(value: 'Regular', child: Text('Regular')),
            DropdownMenuItem(value: 'Shift 1', child: Text('Shift 1')),
            DropdownMenuItem(value: 'Shift 2', child: Text('Shift 2')),
            DropdownMenuItem(value: 'Shift 3', child: Text('Shift 3')),
          ],
          onChanged: (value) {
            if (value != null) {
              controller.selectedShift.value = value;
            }
          },
        ));
  }

  String _normalizeTypeWoLabel(String code, String label) {
    final normalized = code.trim().toUpperCase();
    if (normalized.contains('CORRECTIVE') || normalized == 'CM') {
      return 'Corrective';
    }
    if (normalized.contains('PREV') ||
        normalized.contains('PREVENT') ||
        normalized == 'PM') {
      return 'Preventive';
    }
    if (normalized.contains('PROJECT')) {
      return 'Project';
    }
    final trimmed = label.trim();
    return trimmed.isNotEmpty ? trimmed : code;
  }

  Color _getPriorityColor(String code) {
    switch (code.trim().toUpperCase()) {
      case 'NORMAL':
        return Colors.green;
      case 'EMERGENCY':
        return Colors.red;
      default:
        return Colors.grey;
    }
  }

  Widget _buildDivisionDropdown(WoCreateController controller) {
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
                      controller.selectedDivision.value?['division_name'] ??
                          'Loading...',
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

  Widget _buildAssetSelector(
      WoCreateController controller, BuildContext context) {
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
                        controller.selectedAsset.value?['AssetName'] ??
                            'Pilih Asset',
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

  void _showAssetPicker(BuildContext context, WoCreateController controller) {
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
                        hintStyle:
                            TextStyle(fontSize: 14, color: AppColors.textHint),
                        prefixIcon:
                            Icon(Icons.search, color: AppColors.grey, size: 20),
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
                          Icon(Icons.search_off,
                              size: 64, color: AppColors.grey),
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

  Widget _buildCompanyField(WoCreateController controller) {
    return Obx(() {
      if (controller.companies.isEmpty) {
        return TextFormField(
          controller: controller.companyController,
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
          decoration: InputDecoration(
            labelText: 'Company *',
            labelStyle: const TextStyle(fontSize: 14),
            prefixIcon: const Icon(Icons.business, size: 22),
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            filled: true,
            fillColor: Colors.grey[50],
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          ),
          validator: (value) {
            if (value == null || value.trim().isEmpty) {
              return 'Company harus dipilih';
            }
            return null;
          },
        );
      }

      final items = controller.companies.map((company) {
        final label = (company['label'] ??
                company['company_name'] ??
                company['CompanyName'] ??
                company['Company'] ??
                company['code'] ??
                '')
            .toString()
            .trim();
        return DropdownMenuItem<String>(
          value: label,
          child: Text(label),
        );
      }).toList();

      final current = controller.selectedCompany.value?.toString().trim() ??
          controller.companyController.text.trim();
      final selectedValue =
          items.any((item) => item.value == current) ? current : null;

      return DropdownButtonFormField<String>(
        value: selectedValue,
        style: const TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w500,
          color: Colors.black87,
        ),
        decoration: InputDecoration(
          labelText: 'Company *',
          labelStyle: const TextStyle(fontSize: 14),
          prefixIcon: const Icon(Icons.business, size: 22),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          filled: true,
          fillColor: Colors.grey[50],
          contentPadding:
              const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        ),
        hint: const Text('Select Company'),
        items: items,
        onChanged: (value) {
          if (value != null && value.trim().isNotEmpty) {
            controller.selectedCompany.value = value;
            controller.companyController.text = value;
          }
        },
        validator: (value) {
          final v = (value ?? '').trim();
          if (v.isEmpty) {
            return 'Company harus dipilih';
          }
          return null;
        },
      );
    });
  }

  Widget _buildJobTitleField(WoCreateController controller) {
    return TextFormField(
      controller: controller.jobTitleController,
      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        labelText: 'Job Title *',
        labelStyle: const TextStyle(fontSize: 14),
        prefixIcon: const Icon(Icons.work, size: 22),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: Colors.grey[50],
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
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

  Widget _buildRunningHoursField(WoCreateController controller) {
    return TextFormField(
      controller: controller.runningHoursController,
      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        labelText: 'Running Hours',
        labelStyle: const TextStyle(fontSize: 14),
        prefixIcon: const Icon(Icons.speed, size: 22),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: Colors.grey[50],
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      ),
      keyboardType: TextInputType.number,
    );
  }

  Widget _buildJobRequirementField(WoCreateController controller) {
    return TextFormField(
      controller: controller.jobRequirementController,
      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500),
      decoration: InputDecoration(
        labelText: 'Job Requirement *',
        labelStyle: const TextStyle(fontSize: 14),
        alignLabelWithHint: true,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: Colors.grey[50],
        contentPadding: const EdgeInsets.all(16),
      ),
      maxLines: 4,
      validator: (value) {
        if (value == null || value.trim().isEmpty) {
          return 'Job Requirement harus diisi';
        }
        return null;
      },
    );
  }

  Widget _buildImagePicker(WoCreateController controller) {
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
}
