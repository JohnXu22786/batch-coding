import 'package:flutter_test/flutter_test.dart';
import 'package:demo_1/main.dart';

void main() {
  group('ExtractionItem model', () {
    test('creates with pending status by default', () {
      final item = ExtractionItem(
        videoPath: '/path/to/video.mp4',
        videoName: 'video.mp4',
      );

      expect(item.videoPath, '/path/to/video.mp4');
      expect(item.videoName, 'video.mp4');
      expect(item.status, ExtractionStatus.pending);
      expect(item.audioPath, isNull);
      expect(item.error, isNull);
    });

    test('updates status correctly', () {
      final item = ExtractionItem(
        videoPath: '/path/to/video.mp4',
        videoName: 'video.mp4',
      );

      item.status = ExtractionStatus.processing;
      expect(item.status, ExtractionStatus.processing);

      item.status = ExtractionStatus.completed;
      item.audioPath = '/path/to/audio.m4a';
      expect(item.status, ExtractionStatus.completed);
      expect(item.audioPath, '/path/to/audio.m4a');

      item.status = ExtractionStatus.failed;
      item.error = 'Something went wrong';
      expect(item.status, ExtractionStatus.failed);
      expect(item.error, 'Something went wrong');
    });
  });

  group('ExtractionStatus enum', () {
    test('has all required values', () {
      expect(ExtractionStatus.values.length, 4);
      expect(ExtractionStatus.values, contains(ExtractionStatus.pending));
      expect(ExtractionStatus.values, contains(ExtractionStatus.processing));
      expect(ExtractionStatus.values, contains(ExtractionStatus.completed));
      expect(ExtractionStatus.values, contains(ExtractionStatus.failed));
    });
  });

  group('Demo1App widget', () {
    testWidgets('renders app without error', (tester) async {
      await tester.pumpWidget(const Demo1App());
      expect(find.text('Audio Extraction (easy_video_editor)'), findsOneWidget);
    });

    testWidgets('shows empty state when no videos selected', (tester) async {
      await tester.pumpWidget(const Demo1App());
      expect(find.text('No videos selected'), findsOneWidget);
      expect(find.text('Pick Videos'), findsOneWidget);
    });
  });
}
