import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 서버는 기본적으로 localhost 에서 오는 요청만 허용한다.
  // 같은 Wi-Fi 의 휴대폰에서 http://192.168.x.x:3000 으로 접속해 테스트할 수 있도록 사설망 주소를 허용한다.
  // (개발 모드에만 적용되고 배포 빌드에는 영향이 없다)
  // 외부 접속용 DDNS 도메인도 허용한다.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local", "hyeon266842.gonetis.com"],
  // 개발 중 왼쪽 아래에 뜨는 Next.js 아이콘을 숨긴다 (컴파일/런타임 오류 표시는 그대로 뜬다)
  devIndicators: false,
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
