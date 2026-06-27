import 'package:flutter_test/flutter_test.dart';
import 'package:demo_2/main.dart';

void main() {
  group('VideoInfoItem model', () {
    test('creates with pending status by default', () {
      final item = VideoInfoItem(
        videoPath: '/path/to/video.mp4',
        videoName: 'video.mp4',
      );

      expect(item.videoPath, '/path/to/video.mp4');
      expect(item.videoName, 'video.mp4');
      expect(item.status, InfoStatus.pending);
      expect(item.mediaInfo, isNull);
      expect(item.error, isNull);
    });

    test('updates status correctly', () {
      final item = VideoInfoItem(
        videoPath: '/path/to/video.mp4',
        videoName: 'video.mp4',
      );

      item.status = InfoStatus.loading;
      expect(item.status, InfoStatus.loading);

      item.status = InfoStatus.loaded;
      expect(item.status, InfoStatus.loaded);

      item.status = InfoStatus.failed;
      item.error = 'Failed to get info';
      expect(item.status, InfoStatus.failed);
      expect(item.error, 'Failed to get info');
    });
  });

  group('InfoStatus enum', () {
    test('has all required values', () {
      expect(InfoStatus.values.length, 4);
      expect(InfoStatus.values, contains(InfoStatus.pending));
      expect(InfoStatus.values, contains(InfoStatus.loading));
      expect(InfoStatus.values, contains(InfoStatus.loaded));
      expect(InfoStatus.values, contains(InfoStatus.failed));
    });
  });

  group('Demo2App widget', () {
    testWidgets('renders app without error', (tester) async {
      await tester.pumpWidget(const Demo2App());
      expect(
          find.text('Audio Separation (video_compress)'), findsOneWidget);
    });

    testWidgets('shows empty state when no videos selected', (tester) async {
      await tester.pumpWidget(const Demo2App());
      expect(find.text('No videos selected'), findsOneWidget);
      expect(find.text('Pick Videos'), findsOneWidget);
    });
  });
}
