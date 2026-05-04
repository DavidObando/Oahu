# typed: false
# frozen_string_literal: true

class Oahu < Formula
  desc "Standalone Audible downloader and decrypter"
  homepage "https://github.com/DavidObando/Oahu"
  version "1.1.1"
  license "GPL-3.0-only"

  on_macos do
    on_arm do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-osx-arm64.tar.gz"
      sha256 "faa1a89f50ce03165f72a2503ee11ffa0f2a6ad4c06a5df88272d05b18940264"
    end
    on_intel do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-osx-x64.tar.gz"
      sha256 "5fee3e3c37b63c6b2195a2e877ffe4a1e1a5544847479bc2e7aa0f76272796f7"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-linux-arm64.tar.gz"
      sha256 "99050cc81d10e00c8a5022102c97e67a605f4661c9dfcb20d7913bce3ef4cf88"
    end
    on_intel do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-linux-x64.tar.gz"
      sha256 "7a474bbf6614cccd4ac49d1007578036a70520e5be6757c1b4698505b2e2b9b3"
    end
  end

  def install
    libexec.install Dir["*"]
    chmod 0755, libexec/"Oahu"
    bin.write_exec_script libexec/"Oahu"
  end

  test do
    assert_predicate libexec/"Oahu", :executable?
  end
end
