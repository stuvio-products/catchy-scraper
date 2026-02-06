import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FakeProxyProvider } from './providers/fake-proxy.provider';
import { ProxySchedulerService } from './services/proxy-scheduler.service';
import { IProxyProvider } from './interfaces/proxy.interface';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'PROXY_PROVIDER',
      useClass: FakeProxyProvider,
    },
    {
      provide: ProxySchedulerService,
      useFactory: (provider: IProxyProvider) => {
        return new ProxySchedulerService(provider);
      },
      inject: ['PROXY_PROVIDER'],
    },
  ],
  exports: [ProxySchedulerService, 'PROXY_PROVIDER'],
})
export class ProxyModule {}
