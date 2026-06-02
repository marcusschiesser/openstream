# NixOS module for OpenStream
# Usage in flake-based NixOS config:
#
#   inputs.openstream.url = "github:siddharthvaddem/openstream";
#
#   { inputs, ... }: {
#     imports = [ inputs.openstream.nixosModules.default ];
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
    environment.systemPackages = [ cfg.package ];

    # Screen capture on Wayland requires xdg-desktop-portal.
    # We enable the base portal; users should also enable a
    # desktop-specific portal (e.g. xdg-desktop-portal-gtk,
    # xdg-desktop-portal-hyprland) in their DE config.
    xdg.portal.enable = lib.mkDefault true;
  };
}
