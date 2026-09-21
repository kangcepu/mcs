import 'package:flutter_test/flutter_test.dart';
import 'package:mcs_mobile/app/data/models/approval_center_model.dart';

void main() {
  test('parses the real /v2/approval-center/summary response shape', () {
    // Regression: category counts used to be computed with a different
    // (buggy) heuristic than the actual module_key on each material row,
    // so tapping a domain chip in the app filtered to an empty list even
    // though the badge showed a non-zero count. The backend fix made both
    // derive from the same wo_number classification.
    final summary = ApprovalSummary.fromJson({
      'wo_approvals': 40,
      'wo_closings': 0,
      'materials': 10,
      'mutations': 0,
      'total': 50,
      'categories': {'MTC': 36, 'MESO': 2, 'IS': 0, 'GA': 0, 'PRO': 12},
      'can_decide': true,
    });

    expect(summary.woApprovals, 40);
    expect(summary.woClosings, 0);
    expect(summary.materials, 10);
    expect(summary.mutations, 0);
    expect(summary.total, 50);
    expect(summary.categoryCount('MTC'), 36);
    expect(summary.categoryCount('MESO'), 2);
    expect(summary.categoryCount('IS'), 0);

    // The category breakdown and the section totals must always agree,
    // since both come from the same underlying per-row classification.
    final categorySum = ['MTC', 'MESO', 'IS', 'GA', 'PRO']
        .map(summary.categoryCount)
        .fold<int>(0, (a, b) => a + b);
    expect(categorySum, summary.total);
  });

  test('categoryCount defaults to 0 for an unknown key', () {
    final summary = ApprovalSummary.fromJson({
      'wo_approvals': 0,
      'wo_closings': 0,
      'materials': 0,
      'mutations': 0,
      'categories': {'MTC': 1},
    });

    expect(summary.categoryCount('DOES_NOT_EXIST'), 0);
  });

  test('total is the sum of the four section counts, not a raw field', () {
    final summary = ApprovalSummary.fromJson({
      'wo_approvals': 5,
      'wo_closings': 2,
      'materials': 1,
      'mutations': 3,
    });

    expect(summary.total, 11);
  });
}
