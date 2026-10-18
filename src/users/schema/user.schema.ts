import { Schema, Prop, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../role.enum.js';

// نوع المستند كما يرجع من القاعدة: حقول User + ما يضيفه Mongoose (_id, save(), ...)
export type UserDocument = HydratedDocument<User>;

// timestamps: يضيف createdAt و updatedAt ويحدّثهما تلقائيًا
@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name: string;

  // unique ينشئ فهرسًا فريدًا: القاعدة نفسها ترفض التكرار.
  // lowercase + trim: "Ahmad " و "ahmad" يصبحان الاسم نفسه.
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  username: string;

  // select: false => لا يرجع هذا الحقل في أي استعلام إلا إذا طلبناه صراحةً
  // بـ .select('+passwordHash'). فلو نسينا إخفاءه في مكان ما، لا يتسرّب.
  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ type: String, enum: Object.values(Role), default: Role.Employee })
  role: Role;

  // نعطّل الحساب بدل حذفه: الحذف يترك سجلات حضور بلا صاحب.
  @Prop({ default: true })
  isActive: boolean;

  // أيام عطلة خاصة بهذا الموظف (0 = الأحد ... 6 = السبت).
  // غير موجود = يتبع العطلة الافتراضية في الإعدادات.
  // default: undefined ضروري: بدونه يضع Mongoose مصفوفة فارغة لكل مستخدم،
  // و [] معناها "بلا عطلة إطلاقًا" لا "الافتراضي".
  @Prop({ type: [Number], default: undefined })
  weekendDays?: number[];
}

export const UserSchema = SchemaFactory.createForClass(User);
