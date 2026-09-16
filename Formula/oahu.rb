# typed: false
# frozen_string_literal: true

class Oahu < Formula
  desc "Standalone Audible downloader and decrypter"
  homepage "https://github.com/DavidObando/Oahu"
  version "1.1.28"
  license "GPL-3.0-only"

  on_macos do
    on_arm do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-osx-arm64.tar.gz"
      sha256 "bc4d456bb99c79eb8da916dc4360d598597475117f96e9abebb29374e8a2d7e1"
    end
    on_intel do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-osx-x64.tar.gz"
      sha256 "9968106543607a3c2d84a5cf1c84366847ea1fdc59da2c56ff16fefc110bbcd0"
    end
  end

  on_linux do
    on_arm do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-linux-arm64.tar.gz"
      sha256 "dff559075bcfd94174533f227e9e5649dec9fe9ab0dac62616508fcdaee0d49d"
    end
    on_intel do
      url "https://github.com/DavidObando/Oahu/releases/download/v#{version}/Oahu-#{version}-linux-x64.tar.gz"
      sha256 "c7b3ae6243356e8821ad10ea05ea28cc13a43ae1dd05c8af78d9a9fdfa815607"
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
