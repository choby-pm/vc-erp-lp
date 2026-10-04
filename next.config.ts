import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 소개 페이지(public/intro/index.html)는 /intro 로 연다. 주소에 index.html 을 남겨야 캡처(shots/…) 상대 경로가 맞는다
  async redirects() {
    return [{ source: "/intro", destination: "/intro/index.html", permanent: false }];
  },
};

export default nextConfig;
