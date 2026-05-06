# typed: false
# frozen_string_literal: true

class Oahu < Formula
  desc "Standalone Audible downloader and decrypter"
  homepage "https://github.com/DavidObando/Oahu"
  version "1.1.4"
  license "GPL-3.0-only"

  on_macos do
    on_arm do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-osx-arm64.tar.gz"
      sha256 "d51b30d12e3f5b6c82e18c4a3e693216ca48447f3d1012e35311d59fd6d93573"
    end
    on_intel do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-osx-x64.tar.gz"
      sha256 "209efe64b10f47b7b301fb5201cbbbced7e0745986f2f5bc50411202396f1ab4"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-linux-arm64.tar.gz"
      sha256 "25254423c1ff0f7c38a53520abcdfdf15d218b1d580689e00d366e6f02fc0c2c"
    end
    on_intel do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-linux-x64.tar.gz"
      sha256 "7018cb1ae6465c2076081c6e432c1868477c75b4f382a830f337c43f65a105cd"
    end
  end

  def install
    libexec.install Dir["*"]
    chmod 0755, libexec/"Oahu"
    chmod 0755, libexec/"oahu-cli"
    bin.write_exec_script libexec/"Oahu"
    bin.write_exec_script libexec/"oahu-cli"
  end

  test do
    assert_predicate libexec/"Oahu", :executable?
    assert_predicate libexec/"oahu-cli", :executable?
  end
end
