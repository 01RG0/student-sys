class StudentValidator {
  static validateStudentId(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Student ID is required and must be a string');
    }
    const trimmed = id.trim();
    if (!trimmed) {
      throw new Error('Student ID cannot be empty');
    }
    return trimmed;
  }

  static validateStatus(status, field) {
    const valid = ['registered', 'not_registered', 'unknown'];
    if (!status || typeof status !== 'string') {
      return 'unknown';
    }
    const normalized = status.toLowerCase().trim();
    return valid.includes(normalized) ? normalized : 'unknown';
  }

  static validateHomeworkStatus(status) {
    const valid = ['done', 'not_done', 'unknown'];
    if (!status || typeof status !== 'string') {
      return 'unknown';
    }
    const normalized = status.toLowerCase().trim();
    return valid.includes(normalized) ? normalized : 'unknown';
  }

  static validateRecord(record) {
    if (!record || typeof record !== 'object') {
      throw new Error('Invalid student record format');
    }

    // Required fields
    const studentId = this.validateStudentId(record.studentId);
    
    // Optional fields with defaults
    const registrationStatus = this.validateStatus(record.registrationStatus, 'registration');
    const homeworkStatus = this.validateHomeworkStatus(record.homeworkStatus);
    const comment = record.comment ? String(record.comment).trim() : '';
    const source = record.source || {};

    // Timestamp for tracking
    const timestamp = new Date().toISOString();

    return {
      studentId,
      registrationStatus,
      homeworkStatus,
      comment,
      source,
      timestamp
    };
  }

  static validateExcelRow(row) {
    return {
      studentId: this.validateStudentId(
        String(row['Student ID'] || row['ID'] || row['student id'] || row['id'] || '').trim()
      ),
      fullName: String(row['Name'] || row['Full Name'] || row['name'] || '').trim() || null,
      grade: String(row['Grade'] || row['grade'] || '').trim() || null,
      className: String(row['Class'] || row['class'] || '').trim() || null,
      registrationStatus: this.validateStatus(String(row['Registration'] || row['registration'] || '')),
      homeworkStatus: this.validateHomeworkStatus(String(row['Homework'] || row['homework'] || '')),
      lastUpdatedAt: new Date().toISOString()
    };
  }
}

module.exports = StudentValidator;