# Home Manager module for OpenStream
# Usage in flake-based Home Manager config:
#
#   inputs.openstream.url = "github:siddharthvaddem/openstream";
#
#   { inputs, ... }: {
#     imports = [ inputs.openstream.homeManagerModules.default ];
#     programs.openstream.enable = true;
#   }
self:
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.programs.openstream;
in
{
  options.programs.openstream = {
    enable = lib.mkEnableOption "OpenStream livestreaming app";

    package = lib.mkOption {
      type = lib.types.package;
      default = self.packages.${pkgs.stdenv.hostPlatform.system}.openstream;
      defaultText = lib.literalExpression "inputs.openstream.packages.\${pkgs.stdenv.hostPlatform.system}.openstream";
      description = "The OpenStream package to use.";
    };
  };

  config = lib.mkIf cfg.enable {
    home.packages = [ cfg.package ];
  };
}
