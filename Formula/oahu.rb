# typed: false
# frozen_string_literal: true

class Oahu < Formula
  desc "Standalone Audible downloader and decrypter"
  homepage "https://github.com/DavidObando/Oahu"
  version "1.1.26"
  license "GPL-3.0-only"

  on_macos do
    on_arm do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-osx-arm64.tar.gz"
      sha256 "297e4bc2b7632fb85399fd195ae22a9d735a6bbb69869decb05daa40f7e23d8f"
    end
    on_intel do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-osx-x64.tar.gz"
      sha256 "fbefa5f401e0a8c03c2a99ea110d21bc69a5aace4d0af3de9c409f557401e45e"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-linux-arm64.tar.gz"
      sha256 "475b5ce820e99e2e633816303146bf41739a3a6e7a4841e97bd44b52b5da0acd"
    end
    on_intel do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-linux-x64.tar.gz"
      sha256 "4d0dcf1649a1bf9b42837bbed618b737b3915678170435ddbe7741f03db81b87"
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
