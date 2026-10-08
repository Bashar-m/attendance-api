import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../../users/schema/user.schema.js';

export type AttendanceDocument = HydratedDocument<Attendance>;

/** مستند واحد = يوم عمل واحد لموظف واحد. */
@Schema({ timestamps: true })
export class Attendance {
  // مرجع إلى مستخدم (المقابل للمفتاح الأجنبي في SQL).
  // type صريح لأن Mongoose لا يستنتج ObjectId من نوع TypeScript.
  // ref يخبر populate() من أي مجموعة يجلب المستند المرتبط.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, required: true })
  employee: Types.ObjectId;

  // يوم العمل بالتوقيت المحلي "YYYY-MM-DD" (انظر work-date.ts)
  @Prop({ required: true })
  workDate: string;

  @Prop({ required: true })
  checkIn: Date;

  // null = الموظف ما زال في الدوام (لم يسجّل انصرافه)
  @Prop({ type: Date, default: null })
  checkOut: Date | null;

  // أثر التعديل اليدوي: من عدّل السجل من الإدارة ومتى.
  // null = السجل كما سجّله الموظف بضغطة الزر، لم يلمسه أحد.
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: User.name, default: null })
  editedBy: Types.ObjectId | null;

  @Prop({ type: Date, default: null })
  editedAt: Date | null;
}

export const AttendanceSchema = SchemaFactory.createForClass(Attendance);

// أهم سطر في المشروع: فهرس فريد مركّب.
// القاعدة نفسها ترفض سجلّين للموظف نفسه في اليوم نفسه، حتى لو ضُغط الزر
// مرتين في اللحظة ذاتها أو وصل الطلبان إلى خادمين مختلفين.
// وهو نفسه يسرّع استعلام "سجل هذا الموظف اليوم".
AttendanceSchema.index({ employee: 1, workDate: 1 }, { unique: true });

// يسرّع عرض الإدارة: "كل سجلات يوم معيّن" و"سجلات فترة".
AttendanceSchema.index({ workDate: 1 });
