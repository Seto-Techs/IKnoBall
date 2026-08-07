import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Roles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { response, type ApiResponse } from './common/http/response';
import { ApiDataResponse } from './common/openapi/response';

class AdminDashboard {
  @ApiProperty({ example: 'player@iknoball.test' })
  user!: string;

  @ApiProperty({ example: 'Welcome to the admin dashboard.' })
  message!: string;
}

@ApiTags('Admin')
@Controller('admin')
export class AdminController {
  @Get('dashboard')
  @Roles(['admin'])
  @ApiOperation({ summary: 'Admin dashboard (requires admin role)' })
  @ApiDataResponse(AdminDashboard, HttpStatus.OK, 'Admin access granted.', 'Admin access granted.')
  getDashboard(@Session() session: UserSession): ApiResponse<AdminDashboard> {
    return response(true, 'Admin access granted.', {
      user: session.user.email,
      message: 'Welcome to the admin dashboard.',
    });
  }
}
