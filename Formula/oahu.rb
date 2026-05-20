# typed: false
# frozen_string_literal: true

class Oahu < Formula
  desc "Standalone Audible downloader and decrypter"
  homepage "https://github.com/DavidObando/Oahu"
  version "1.1.6"
  license "GPL-3.0-only"

  on_macos do
    on_arm do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-osx-arm64.tar.gz"
      sha256 "89c07728e068f2bc2aca664ac7e0f0a6365f430f70ec0b734357ab0a0206d54f"
    end
    on_intel do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-osx-x64.tar.gz"
      sha256 "4a17dda087f8aac6a491dad0ae786bb8df51f961b64a0e1cd083e6106f8d95dd"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-linux-arm64.tar.gz"
      sha256 "eaa812b5b8e327b394b8bbfd865886c059ea2d16bc359e5c493adf1cafb61aff"
    end
    on_intel do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-linux-x64.tar.gz"
      sha256 "21851d1feac41ae762a697ab7fbe60d206e1cd45c3deb5758f8c086232dc97de"
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
