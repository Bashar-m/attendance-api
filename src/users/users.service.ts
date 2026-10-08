import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { hash } from 'bcrypt';
import { Model } from 'mongoose';
import { isDuplicateKeyError } from '../common/mongo-errors.js';
import { UserCreateDto } from './dto/user.create.dto.js';
import { UserUpdateDto } from './dto/user.update.dto.js';
import { Role } from './role.enum.js';
import { User, UserDocument } from './schema/user.schema.js';

// عدد جولات bcrypt: كل زيادة بواحد تضاعف زمن التشفير.
// 10 توازن جيد: نحو عُشر ثانية للمستخدم، وسنوات لمن يحاول التخمين.
const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    // @InjectModel ضروري: النوع Model<User> يختفي عند التشغيل،
    // فنخبر Nest بالاسم الذي سُجّل به الموديل في forFeature.
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  /** إنشاء موظف. الدور دائمًا employee لأننا لا نأخذه من الطلب. */
  async create(dto: UserCreateDto) {
    return this.insert(dto, Role.Employee);
  }

  /** يستخدمه AdminSeeder فقط، وليس له مسار في الـ API. */
  async createAdmin(dto: UserCreateDto) {
    return this.insert(dto, Role.Admin);
  }

  async adminExists(): Promise<boolean> {
    return (await this.userModel.exists({ role: Role.Admin })) !== null;
  }

  async findAll(): Promise<UserDocument[]> {
    return this.userModel.find().sort({ createdAt: -1 }).exec();
  }

  async findActiveEmployees(): Promise<UserDocument[]> {
    return this.userModel
      .find({ role: Role.Employee, isActive: true })
      .sort({ name: 1 })
      .exec();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  /**
   * الدالة الوحيدة التي تُرجع الهاش، ويستخدمها تسجيل الدخول فقط.
   * الاسم الطويل مقصود: من يستدعيها يعرف أنه يحمل بيانات حساسة.
   */
  async findByUsernameWithPassword(
    username: string,
  ): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ username: username.trim().toLowerCase() })
      .select('+passwordHash')
      .exec();
  }

  async update(id: string, dto: UserUpdateDto): Promise<UserDocument> {
    // نفصل password عن الباقي: هو لا يُحفظ كما هو، بل يتحوّل إلى passwordHash.
    const { password, ...rest } = dto;
    const changes: Partial<User> = { ...rest };
    if (password) {
      changes.passwordHash = await hash(password, SALT_ROUNDS);
    }

    const user = await this.userModel
      // returnDocument: 'after' => أرجع المستند بعد التعديل لا قبله
      // runValidators => طبّق قواعد الـ Schema على التعديل أيضًا
      .findByIdAndUpdate(id, changes, {
        returnDocument: 'after',
        runValidators: true,
      })
      .exec();

    if (!user) {
      throw new NotFoundException('المستخدم غير موجود');
    }
    return user;
  }

  private async insert(dto: UserCreateDto, role: Role) {
    const passwordHash = await hash(dto.password, SALT_ROUNDS);

    try {
      // نكتب الحقول واحدًا واحدًا بدل ...dto:
      // هكذا لا يصل إلى القاعدة إلا ما قرّرناه نحن.
      const user = await this.userModel.create({
        name: dto.name,
        username: dto.username,
        passwordHash,
        role,
      });

      // select: false يعمل على الاستعلامات فقط، لا على ما ترجعه create()،
      // فنحذف الهاش يدويًا قبل إرجاع الرد.
      const { passwordHash: _removed, ...safe } = user.toObject();
      return safe;
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('اسم المستخدم مستخدَم مسبقًا');
      }
      throw error;
    }
  }
}
